import test from "node:test";
import assert from "node:assert/strict";
import { allocateCredits, creditBalanceLine, feeCreditConfig, restorePlan, statusFor, FEE_CREDIT_INR, FEE_CREDIT_PAIRS_CAP } from "./fee-credits.ts";

test("config: kill switch defaults off; ₹499 credit; 4-pair cap; bad values fall back", () => {
  assert.deepEqual(feeCreditConfig({}), { enabled: false, amountInr: FEE_CREDIT_INR, pairsCap: FEE_CREDIT_PAIRS_CAP });
  assert.equal(FEE_CREDIT_INR, 499);
  assert.equal(FEE_CREDIT_PAIRS_CAP, 4);
  assert.deepEqual(feeCreditConfig({ ROOMEO_REFERRAL_CREDITS_ENABLED: "true", ROOMEO_REFERRAL_CREDIT_INR: "200", ROOMEO_REFERRAL_CREDIT_PAIRS_CAP: "6" }), { enabled: true, amountInr: 200, pairsCap: 6 });
  assert.deepEqual(feeCreditConfig({ ROOMEO_REFERRAL_CREDIT_INR: "-5", ROOMEO_REFERRAL_CREDIT_PAIRS_CAP: "x" }), { enabled: false, amountInr: 499, pairsCap: 4 });
});

test("allocate: oldest first, never more than the fee (partial only when the fee is smaller)", () => {
  const credits = [{ id: "b", remainingInr: 499, createdAt: "2026-11-02" }, { id: "a", remainingInr: 100, createdAt: "2026-11-01" }];
  assert.deepEqual(allocateCredits(499, credits), [{ creditId: "a", amountInr: 100 }, { creditId: "b", amountInr: 399 }]);
  assert.deepEqual(allocateCredits(250, [{ id: "x", remainingInr: 499, createdAt: "1" }]), [{ creditId: "x", amountInr: 250 }]);
  assert.deepEqual(allocateCredits(0, credits), []);
  assert.deepEqual(allocateCredits(499, []), []);
});

test("status and restore order", () => {
  assert.equal(statusFor(499, 499), "applied");
  assert.equal(statusFor(499, 250), "issued");
  assert.deepEqual(restorePlan([{ creditId: "a", netInr: 100, at: "1" }, { creditId: "b", netInr: 399, at: "2" }], 249), [{ creditId: "b", amountInr: 249 }]);
  assert.deepEqual(restorePlan([{ creditId: "a", netInr: 100, at: "1" }, { creditId: "b", netInr: 399, at: "2" }], 1000), [{ creditId: "b", amountInr: 399 }, { creditId: "a", amountInr: 100 }]);
});

test("balance line says credit, not cash", () => {
  assert.match(creditBalanceLine(499), /₹499 Roomeo credit.*isn't cash/);
  assert.equal(creditBalanceLine(0), "No Roomeo credit right now.");
});
