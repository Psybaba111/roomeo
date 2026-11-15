/**
 * Better Auth 1.7 compatibility + account-linking policy (server-only helpers,
 * kept dependency-light so they can be unit-tested without `pg` or env).
 *
 * 1. Broker callback path. Better Auth 1.7 moved generic-OAuth callbacks from
 *    `/api/auth/oauth2/callback/:id` to `/api/auth/callback/:id`. The Grok auth
 *    broker only accepts the OLD path (see `./preview`), and re-registering the
 *    redirect URI is an external change. So we keep issuing the old
 *    `redirect_uri` (via the provider's `callbackPath`) and rewrite incoming
 *    requests on the old path onto the core `/callback/:id` handler.
 *
 * 2. Account subject. 1.6 used the broker profile's `id`, then `sub`, as the
 *    account id. 1.7 plain-OAuth providers use only `id`, so we restore the 1.6
 *    order; existing `account.accountId` rows keep matching.
 *
 * 3. Account linking (pre-account-takeover fix). Email/password sign-up does
 *    not verify the address, so an attacker could register `victim@gmail.com`
 *    and wait for the real owner to sign in with Google, which would link into
 *    the attacker's account. `requireLocalEmailVerified: true` refuses to link
 *    any provider into a local user whose email is not verified.
 */
import type { BetterAuthPlugin } from "better-auth";

export const LEGACY_OAUTH2_CALLBACK_SEGMENT = "/oauth2/callback/";

/** Provider callback path (relative to the auth base path) that the broker accepts. */
export function legacyCallbackPath(providerId: string): string {
  return `${LEGACY_OAUTH2_CALLBACK_SEGMENT}${providerId}`;
}

/**
 * If `url` targets `<basePath>/oauth2/callback/<id>` for one of `providerIds`,
 * return the same URL on `<basePath>/callback/<id>`; otherwise `null`.
 */
export function rewriteLegacyCallbackUrl(
  url: string,
  providerIds: readonly string[],
  basePath = "/api/auth",
): string | null {
  const parsed = new URL(url);
  const prefix = `${basePath.replace(/\/+$/, "")}${LEGACY_OAUTH2_CALLBACK_SEGMENT}`;
  if (!parsed.pathname.startsWith(prefix)) return null;
  const id = decodeURIComponent(parsed.pathname.slice(prefix.length).replace(/\/+$/, ""));
  if (!id || id.includes("/") || !providerIds.includes(id)) return null;
  parsed.pathname = `${basePath.replace(/\/+$/, "")}/callback/${encodeURIComponent(id)}`;
  return parsed.toString();
}

type ProviderLike = { id: string; callbackPath?: string };
type InitResult = { context?: { socialProviders?: ProviderLike[] } & Record<string, unknown> } | void;

/**
 * Wrap a `genericOAuth(...)` plugin so its providers keep the 1.6 callback URL,
 * and add an `onRequest` hook that routes that URL to the core callback.
 */
export function withLegacyOAuth2Callback<P extends BetterAuthPlugin>(
  plugin: P,
  providerIds: readonly string[],
): P {
  const ids = new Set(providerIds);
  const originalInit = plugin.init;
  const wrapped = {
    ...plugin,
    init: async (ctx: Parameters<NonNullable<BetterAuthPlugin["init"]>>[0]) => {
      const result = (originalInit ? await originalInit(ctx) : undefined) as InitResult;
      for (const provider of result?.context?.socialProviders ?? []) {
        if (ids.has(provider.id)) provider.callbackPath = legacyCallbackPath(provider.id);
      }
      return result;
    },
    onRequest: async (request: Request, ctx: { options?: { basePath?: string } }) => {
      const next = rewriteLegacyCallbackUrl(request.url, providerIds, ctx?.options?.basePath || "/api/auth");
      if (!next) return;
      return { request: new Request(next, request) };
    },
  };
  return wrapped as unknown as P;
}

/** 1.6-compatible account subject for broker (plain OAuth) profiles: `id`, else `sub`. */
export function brokerAccountSubject({ profile }: { profile: Record<string, unknown> }): string {
  for (const key of ["id", "sub"] as const) {
    const value = profile[key];
    if ((typeof value === "string" && value.trim()) || typeof value === "number") return String(value);
  }
  return "";
}

/**
 * Account-linking policy shared by `server.ts` and the tests.
 *
 * `requireLocalEmailVerified: true` — never auto-link a Google / broker / gate
 * identity into a local account whose email is unverified (e.g. an
 * email/password sign-up). Returning users are unaffected: an already-linked
 * account is found by (providerId, accountId) before any linking happens, and
 * X's synthetic emails never collide with a real address.
 */
export function accountLinkingConfig(trustedProviders: string[]) {
  return {
    enabled: true,
    trustedProviders,
    requireLocalEmailVerified: true,
  };
}
