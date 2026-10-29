import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REFUND_DAYS,
  depositTerms,
  headlinePrice,
  photoDateLabel,
  trustOf,
  videoUrlError,
} from "./trust.ts";
import { contactAccess, pricingConfig } from "./pricing.ts";
import { dashboardPasses } from "./dashboard-passes.ts";

test("trust fields default: no all-in, 7 day refund", () => {
  assert.deepEqual(trustOf({}, 8000), {
    allInInr: null,
    allInIncludes: "",
    videoTourUrl: "",
    depositRefundDays: DEFAULT_REFUND_DAYS,
  });
});
test("all-in needs what's included and can't undercut rent", () => {
  assert.throws(() => trustOf({ allInInr: 9000 }, 8000), /includes/);
  assert.throws(
    () => trustOf({ allInInr: 7000, allInIncludes: "rent" }, 8000),
    /lower than the rent/,
  );
  assert.equal(
    trustOf({ allInInr: "9499", allInIncludes: " rent,  food , wifi " }, 6999).allInIncludes,
    "rent, food , wifi",
  );
});
test("video link must be https", () => {
  assert.equal(videoUrlError(""), "");
  assert.equal(videoUrlError("https://youtu.be/abc"), "");
  assert.match(videoUrlError("http://x.com/v"), /https/);
  assert.match(videoUrlError("javascript:alert(1)"), /https/);
  assert.match(videoUrlError("not a url"), /https/);
});
test("refund days 1-60", () => {
  assert.equal(trustOf({ depositRefundDays: 14 }, 0).depositRefundDays, 14);
  assert.throws(() => trustOf({ depositRefundDays: 0 }, 0));
  assert.throws(() => trustOf({ depositRefundDays: 90 }, 0));
});
test("deposit terms and photo date copy", () => {
  assert.equal(depositTerms(10000, 7), "Deposit ₹10,000 · refunded within 7 days of move-out");
  assert.equal(depositTerms(0, 7), "No deposit");
  assert.equal(photoDateLabel(null), "");
  assert.equal(photoDateLabel("2026-10-12T05:00:00Z"), "Photo updated 12 Oct 2026");
  assert.deepEqual(headlinePrice(6999, 9499), { amount: 9499, allIn: true });
  assert.deepEqual(headlinePrice(6999, null), { amount: 6999, allIn: false });
});
test("free trust-first defaults: chat free, no passes, boosts and fast track parked, success fee off", () => {
  const c = pricingConfig({ ROOMEO_PASSES_ENABLED: "true", ROOMEO_SUCCESS_FEE_ENABLED: "true" });
  assert.equal(c.paidChatEnabled, false);
  assert.equal(c.passesEnabled, false);
  assert.equal(c.boostsEnabled, false);
  assert.equal(c.fastTrackEnabled, false);
  assert.equal(c.successFeeEnabled, false);
  assert.deepEqual(contactAccess(c, { phoneVerified: true, freeUsed: 999, activePassId: null }), {
    kind: "OPEN",
    source: "FREE",
    freeLeftAfter: -1,
  });
  assert.deepEqual(contactAccess(c, { phoneVerified: false, freeUsed: 0, activePassId: null }), {
    kind: "NEED_PHONE",
  });
  assert.deepEqual(
    dashboardPasses({
      weekly: 149,
      monthly: 299,
      squadPerMember: 99,
      squadDays: 30,
      model: "FREE_THEN_PASS",
      paidChatEnabled: false,
    }),
    [],
  );
});
