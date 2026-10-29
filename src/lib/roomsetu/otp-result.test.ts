import test from "node:test";
import assert from "node:assert/strict";
import { classifyOtpFailure, resendSecondsLeft, verifyOtpMessage } from "./otp-result.ts";

test("classifies OTP outcomes", () => {
  assert.deepEqual(classifyOtpFailure({ expired: false, attempts: 1 }, true, 5), { ok: true });
  assert.deepEqual(classifyOtpFailure(null, false, 5), { ok: false, reason: "no_code" });
  assert.deepEqual(classifyOtpFailure({ expired: true, attempts: 0 }, false, 5), { ok: false, reason: "expired" });
  assert.deepEqual(classifyOtpFailure({ expired: false, attempts: 2 }, false, 5), { ok: false, reason: "wrong", triesLeft: 3 });
  assert.deepEqual(classifyOtpFailure({ expired: false, attempts: 5 }, false, 5), { ok: false, reason: "too_many" });
  // expiry wins over attempts
  assert.deepEqual(classifyOtpFailure({ expired: true, attempts: 5 }, false, 5), { ok: false, reason: "expired" });
});

test("every outcome has a visible message", () => {
  assert.deepEqual(verifyOtpMessage({ ok: true }), { text: "Phone verified ✓", tone: "success" });
  assert.equal(verifyOtpMessage({ ok: false, reason: "expired" }).text, "Code expired, tap Resend");
  assert.equal(verifyOtpMessage({ ok: false, reason: "wrong", triesLeft: 3 }).text, "Wrong code, 3 tries left");
  assert.equal(verifyOtpMessage({ ok: false, reason: "wrong", triesLeft: 1 }).text, "Wrong code, 1 try left");
  assert.match(verifyOtpMessage({ ok: false, reason: "too_many" }).text, /^Too many tries/);
  assert.match(verifyOtpMessage({ ok: false, reason: "no_code" }).text, /Resend/);
});

test("resend cooldown", () => {
  assert.equal(resendSecondsLeft(null, 1000), 0);
  assert.equal(resendSecondsLeft(0, 0), 30);
  assert.equal(resendSecondsLeft(0, 10_500), 20);
  assert.equal(resendSecondsLeft(0, 30_000), 0);
  assert.equal(resendSecondsLeft(0, 99_000), 0);
});
