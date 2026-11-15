import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { genericOAuth } from "better-auth/plugins";
import {
  accountLinkingConfig,
  brokerAccountSubject,
  legacyCallbackPath,
  rewriteLegacyCallbackUrl,
  withLegacyOAuth2Callback,
} from "./auth-compat.ts";

const BASE = "http://localhost:3000";
const PROVIDER = "grok-google";

/** A real Better Auth instance wired like `server.ts` (broker provider + linking policy), on an in-memory DB. */
function makeAuth(opts: { requireLocalEmailVerified?: boolean; profile: Record<string, unknown> }) {
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
  const linking = accountLinkingConfig([PROVIDER, "google"]);
  const auth = betterAuth({
    baseURL: BASE,
    secret: "test-only-secret-test-only-secret-0000",
    database: memoryAdapter(db),
    trustedOrigins: [BASE],
    emailAndPassword: { enabled: true },
    account: {
      accountLinking:
        opts.requireLocalEmailVerified === undefined
          ? linking
          : { ...linking, requireLocalEmailVerified: opts.requireLocalEmailVerified },
    },
    plugins: [
      withLegacyOAuth2Callback(
        genericOAuth({
          config: [
            {
              providerId: PROVIDER,
              clientId: "client",
              clientSecret: "client-secret",
              authorizationUrl: "https://broker.example/api/auth/oauth2/authorize",
              tokenUrl: "https://broker.example/api/auth/oauth2/token",
              getToken: async () => ({ accessToken: "at", tokenType: "Bearer" }),
              getUserInfo: async () => opts.profile as never,
              accountSubject: brokerAccountSubject,
              pkce: false,
            },
          ],
        }),
        [PROVIDER],
      ),
    ],
  });
  return { auth, db };
}

function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Run the broker sign-in round-trip through the LEGACY callback URL. */
async function brokerSignIn(auth: ReturnType<typeof makeAuth>["auth"]) {
  const start = await auth.handler(
    new Request(`${BASE}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ provider: PROVIDER, callbackURL: "/done", errorCallbackURL: "/failed" }),
    }),
  );
  assert.equal(start.status, 200);
  const { url } = (await start.json()) as { url: string };
  const authorize = new URL(url);
  const state = authorize.searchParams.get("state") ?? "";
  const cb = await auth.handler(
    new Request(`${BASE}/api/auth/oauth2/callback/${PROVIDER}?code=abc&state=${encodeURIComponent(state)}`, {
      headers: { cookie: cookieHeader(start) },
    }),
  );
  return { authorize, cb, location: cb.headers.get("location") ?? "" };
}

describe("legacy broker callback path (Better Auth 1.7 upgrade)", () => {
  test("rewrites only the old broker callback for known providers", () => {
    assert.equal(
      rewriteLegacyCallbackUrl(`${BASE}/api/auth/oauth2/callback/grok-x?code=1&state=s`, ["grok-x"]),
      `${BASE}/api/auth/callback/grok-x?code=1&state=s`,
    );
    assert.equal(rewriteLegacyCallbackUrl(`${BASE}/api/auth/oauth2/callback/evil`, ["grok-x"]), null);
    assert.equal(rewriteLegacyCallbackUrl(`${BASE}/api/auth/callback/grok-x`, ["grok-x"]), null);
    assert.equal(rewriteLegacyCallbackUrl(`${BASE}/api/auth/oauth2/callback/grok-x/extra`, ["grok-x"]), null);
    assert.equal(legacyCallbackPath("grok-x"), "/oauth2/callback/grok-x");
  });

  test("account subject keeps 1.6 order: id, then sub", () => {
    assert.equal(brokerAccountSubject({ profile: { id: "a", sub: "b" } }), "a");
    assert.equal(brokerAccountSubject({ profile: { sub: "b" } }), "b");
    assert.equal(brokerAccountSubject({ profile: { id: 42 } }), "42");
    assert.equal(brokerAccountSubject({ profile: {} }), "");
  });

  test("sign-in still sends the broker the 1.6 redirect_uri, without PKCE, and the old path completes sign-in", async () => {
    const { auth, db } = makeAuth({ profile: { sub: "broker-user-1", email: "new@example.com", email_verified: true, emailVerified: true, name: "New" } });
    const { authorize, cb, location } = await brokerSignIn(auth);
    assert.equal(authorize.searchParams.get("redirect_uri"), `${BASE}/api/auth/oauth2/callback/${PROVIDER}`);
    assert.equal(authorize.searchParams.get("code_challenge"), null);
    assert.equal(authorize.searchParams.get("idp"), null); // only set via authorizationUrlParams in server.ts
    assert.equal(cb.status, 302, `callback status ${cb.status}`);
    assert.ok(location.endsWith("/done"), `redirected to ${location}`);
    const accounts = db.account as { providerId: string; accountId: string }[];
    assert.deepEqual(accounts.map((a) => [a.providerId, a.accountId]), [[PROVIDER, "broker-user-1"]]);
  });
});

describe("account linking requires a verified local email (pre-account-takeover)", () => {
  const victimProfile = { id: "google-victim", email: "victim@example.com", emailVerified: true, name: "Victim" };

  async function attackerSignsUp(auth: ReturnType<typeof makeAuth>["auth"]) {
    const res = await auth.api.signUpEmail({
      body: { email: "victim@example.com", password: "attacker-pass-123", name: "Attacker" },
    });
    return res.user.id;
  }

  test("policy: linking on, trusted providers kept, local email must be verified", () => {
    assert.deepEqual(accountLinkingConfig(["google"]), {
      enabled: true,
      trustedProviders: ["google"],
      requireLocalEmailVerified: true,
    });
  });

  test("an unverified email/password account is NOT linked to the provider identity", async () => {
    const { auth, db } = makeAuth({ profile: victimProfile });
    await attackerSignsUp(auth);
    const { location } = await brokerSignIn(auth);
    assert.match(location, /error=account_not_linked/);
    const accounts = db.account as { providerId: string }[];
    assert.deepEqual(accounts.map((a) => a.providerId), ["credential"]);
  });

  test("control: the old setting (requireLocalEmailVerified: false) WOULD have linked it", async () => {
    const { auth, db } = makeAuth({ profile: victimProfile, requireLocalEmailVerified: false });
    const attackerId = await attackerSignsUp(auth);
    const { location } = await brokerSignIn(auth);
    assert.ok(location.endsWith("/done"), location);
    const accounts = db.account as { providerId: string; userId: string }[];
    assert.ok(accounts.some((a) => a.providerId === PROVIDER && a.userId === attackerId));
  });

  test("a verified local account still links", async () => {
    const { auth, db } = makeAuth({ profile: victimProfile });
    const userId = await attackerSignsUp(auth);
    (db.user as { id: string; emailVerified: boolean }[]).find((u) => u.id === userId)!.emailVerified = true;
    const { location } = await brokerSignIn(auth);
    assert.ok(location.endsWith("/done"), location);
    assert.ok((db.account as { providerId: string }[]).some((a) => a.providerId === PROVIDER));
  });
});
