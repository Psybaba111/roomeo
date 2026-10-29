import test from "node:test";
import assert from "node:assert/strict";
import { canPublish, ConsoleOtpProvider, generateOtp, hashOtp, normalizeIndianMobile, otpMatches, otpProviderFromEnv, SmsGatewayOtpProvider } from "./otp.ts";

test("normalizes Indian mobiles", () => {
  for (const ok of ["9876543210", "+91 98765 43210", "919876543210", "09876543210", "(987) 654-3210"]) {
    assert.equal(normalizeIndianMobile(ok), "+919876543210", ok);
  }
  for (const bad of ["12345", "5876543210", "+1 415 555 0100", "98765432100", "abc"]) {
    assert.equal(normalizeIndianMobile(bad), null, bad);
  }
});

test("otp is 6 digits and only matches the same user, phone and code", () => {
  assert.equal(generateOtp(() => 42), "000042");
  assert.match(generateOtp(), /^\d{6}$/);
  const h = hashOtp("u1", "+919876543210", "123456");
  assert.equal(otpMatches(h, "u1", "+919876543210", "123456"), true);
  assert.equal(otpMatches(h, "u2", "+919876543210", "123456"), false);
  assert.equal(otpMatches(h, "u1", "+919876543211", "123456"), false);
  assert.equal(otpMatches(h, "u1", "+919876543210", "654321"), false);
  assert.equal(otpMatches(h, "u1", "+919876543210", "12345"), false);
});

test("provider selection from env", () => {
  assert.ok(otpProviderFromEnv({}) instanceof ConsoleOtpProvider);
  assert.equal(otpProviderFromEnv({ NODE_ENV: "production" }), null);
  assert.equal(otpProviderFromEnv({ NODE_ENV: "production", OTP_PROVIDER: "console" }), null);
  assert.ok(otpProviderFromEnv({ NODE_ENV: "production", OTP_PROVIDER: "console", OTP_ALLOW_CONSOLE: "true" }) instanceof ConsoleOtpProvider);
  assert.equal(otpProviderFromEnv({ OTP_PROVIDER: "sms-gateway" }), null);
  assert.ok(otpProviderFromEnv({ OTP_PROVIDER: "sms-gateway", SMS_GATEWAY_URL: "http://x", SMS_GATEWAY_USER: "u", SMS_GATEWAY_PASSWORD: "p" }) instanceof SmsGatewayOtpProvider);
});

test("sms-gateway provider posts the documented payload with basic auth", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response("{}", { status: 202 });
  }) as unknown as typeof fetch;
  await new SmsGatewayOtpProvider("http://10.0.0.5:8080/", "sms", "pw", fake).send("+919876543210", "Your code is 123456");
  assert.equal(seen!.url, "http://10.0.0.5:8080/message");
  assert.deepEqual(JSON.parse(String(seen!.init.body)), { message: "Your code is 123456", phoneNumbers: ["+919876543210"] });
  assert.equal((seen!.init.headers as Record<string, string>).authorization, `Basic ${Buffer.from("sms:pw").toString("base64")}`);
});

test("publish needs both phone and ID verified", () => {
  assert.equal(canPublish({ identityStatus: "VERIFIED", phoneVerified: true }), true);
  assert.equal(canPublish({ identityStatus: "VERIFIED", phoneVerified: false }), false);
  assert.equal(canPublish({ identityStatus: "PENDING", phoneVerified: true }), false);
});

test("WhatsApp OTP TTL matches the template's 5-minute copy-code button", async () => {
  const { otpTtlMinutes } = await import("./otp.ts");
  assert.equal(otpTtlMinutes({ name: "mappstore-whatsapp" }), 5);
  assert.equal(otpTtlMinutes({ name: "console" }), 10);
});
