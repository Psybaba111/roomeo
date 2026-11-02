import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { idGate, idProviderFromEnv, idVerificationEnabled, last4, MockIdProvider } from "./id-verify.ts";
import { FallbackOtpProvider, MockWhatsappOtpProvider, otpProviderFromEnv, otpTtlMinutes, type OtpProvider } from "./otp.ts";
import { testDb } from "./pgtest.ts";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("flags default OFF", () => {
  assert.equal(idVerificationEnabled({}), false);
  assert.equal(idVerificationEnabled({ ROOMEO_ID_VERIFICATION_ENABLED: "true" }), true);
  assert.equal(otpProviderFromEnv({ NODE_ENV: "production" }), null, "unchanged prod default");
  assert.equal(otpProviderFromEnv({ OTP_PROVIDER: "console" })?.name, "console", "WhatsApp-first only when its flag is on");
});

test("gate: blocked when flag on and unverified; allowed when off or verified", () => {
  for (const action of ["TRIAL_BOOKING", "DEAL_ACCEPT", "DEAL_SIGN"] as const) {
    assert.match(idGate({ enabled: true, identityStatus: "UNVERIFIED", action }) ?? "", /Verify your ID with DigiLocker/);
    assert.match(idGate({ enabled: true, identityStatus: "", action }) ?? "", /Verification page/);
    assert.match(idGate({ enabled: true, identityStatus: "FAILED", action }) ?? "", /before/);
    assert.equal(idGate({ enabled: true, identityStatus: "VERIFIED", action }), null);
    assert.equal(idGate({ enabled: false, identityStatus: "UNVERIFIED", action }), null);
  }
  assert.match(idGate({ enabled: true, identityStatus: null, action: "TRIAL_BOOKING" }) ?? "", /booking a trial night/);
});

test("gates are wired into trial booking, deal accept and deal sign", () => {
  assert.match(src("lib/roomsetu/trial-api.ts"), /assertIdVerified\(await getSql\(\), context\.userId, "TRIAL_BOOKING"\)/);
  assert.match(src("lib/roomsetu/agreement-api.ts"), /assertIdVerified\(sql, context\.userId, "DEAL_SIGN"\)/);
  assert.match(src("lib/roomsetu/account-api.ts"), /data\.status === "ACCEPTED"[\s\S]{0,200}"DEAL_ACCEPT"/);
});

test("mock ID provider keeps only last 4; never in production by default", async () => {
  assert.equal(last4("1234 5678 9012"), "9012");
  assert.equal(last4("ab"), "");
  const p = new MockIdProvider();
  assert.match(p.startUrl({ verificationId: "v1", docType: "STUDENT_ID" }), /\/verify\/id-mock\?v=v1&doc=STUDENT_ID/);
  assert.deepEqual(await p.complete({ verificationId: "12345678-x", payload: { outcome: "pass", name: "Sam Seeker", idNumber: "1234 5678 9012" } }),
    { ok: true, name: "Sam Seeker", idLast4: "9012", providerRef: "mock-12345678" });
  assert.equal((await p.complete({ verificationId: "v", payload: { outcome: "fail" } })).ok, false);
  assert.equal(idProviderFromEnv({ NODE_ENV: "production" }), null);
  assert.equal(idProviderFromEnv({})?.name, "mock");
});

test("WhatsApp first, SMS fallback when WhatsApp fails", async () => {
  const sent: string[] = [];
  const sms: OtpProvider = { name: "sms", send: async (to) => { sent.push(`sms:${to}`); } };
  const f = new FallbackOtpProvider(new MockWhatsappOtpProvider(), sms);
  await f.send("+919876511111", "m", "123456");
  assert.equal(f.lastChannel, "whatsapp");
  assert.deepEqual(sent, []);
  await f.send("+919876510000", "m", "123456");
  assert.equal(f.lastChannel, "sms");
  assert.deepEqual(sent, ["sms:+919876510000"]);
  const env = { ROOMEO_WHATSAPP_OTP_ENABLED: "true", OTP_WHATSAPP_PROVIDER: "mock" };
  const p = otpProviderFromEnv(env);
  assert.equal(p?.name, "whatsapp-mock+console");
  assert.equal(otpTtlMinutes(p!), 5);
  assert.equal(otpProviderFromEnv({ ...env, NODE_ENV: "production" }), null, "mock WhatsApp + console SMS refused in prod");
});

test("migration 0026 stores only minimised fields", async () => {
  const { pg } = await testDb();
  const cols = (await pg.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'identity_verifications' order by ordinal_position`)).rows.map((r) => r.column_name);
  assert.deepEqual(cols, ["id", "user_id", "provider", "doc_type", "status", "verified_name", "id_last4", "provider_ref", "failure_reason", "created_at", "completed_at"]);
  await pg.close();
});
