import test from "node:test";
import assert from "node:assert/strict";
import { squadMoveInConfirmed, squadSuccessShareInr, boostedUntil, contactAccess, contactQuote, moveInConfirmed, passRefundDue, passSettleable, passWindow, pricingConfig, squadShareInr, squadUnlockReady } from "./pricing.ts";
import { containsContactDetails } from "./contact.ts";

test("legacy model keeps ₹499 per listing", () => {
  const cfg = pricingConfig({ ROOMEO_CONTACT_MODEL: "PER_LISTING_FEE" });
  assert.equal(cfg.contactModel, "PER_LISTING_FEE");
  assert.deepEqual(contactQuote(cfg, {}), { amountInr: 499, splitParts: 0 });
  assert.deepEqual(contactQuote(cfg, { squadMembers: 3, mode: "FULL" }), { amountInr: 499, splitParts: 0 });
});

test("squad split shares round up", () => {
  assert.equal(squadShareInr(499, 3), 167);
  assert.equal(squadShareInr(499, 2), 250);
  assert.equal(squadShareInr(500, 4), 125);
  assert.deepEqual(contactQuote(pricingConfig({ ROOMEO_CONTACT_MODEL: "PER_LISTING_FEE" }), { squadMembers: 4, mode: "SPLIT" }), { amountInr: 125, splitParts: 4 });
  assert.throws(() => contactQuote(pricingConfig({ ROOMEO_SQUAD_SPLIT: "false" }), { squadMembers: 3, mode: "SPLIT" }));
});

test("unlock when full paid or all shares paid", () => {
  assert.equal(squadUnlockReady({ fullPaid: true, splitParts: 0, sharesPaid: 0 }), true);
  assert.equal(squadUnlockReady({ fullPaid: false, splitParts: 3, sharesPaid: 2 }), false);
  assert.equal(squadUnlockReady({ fullPaid: false, splitParts: 3, sharesPaid: 3 }), true);
  assert.equal(squadUnlockReady({ fullPaid: false, splitParts: 0, sharesPaid: 0 }), false);
});

test("owner notes cannot carry contact details", () => {
  for (const bad of ["call 98450 12345", "mail me a@b.co", "wa.me/9198", "whatsapp me", "insta @flat_owner", "see www.x.com"]) assert.equal(containsContactDetails(bad), true, bad);
  for (const ok of ["Visit Saturday 10am works", "Rent is negotiable for 3 people", "2 months deposit"]) assert.equal(containsContactDetails(ok), false, ok);
});


test("default config: flat-fee model, passes off, fee collection off", () => {
  const c = pricingConfig({});
  assert.equal(c.contactModel, "PER_LISTING_FEE");
  assert.equal(pricingConfig({ ROOMEO_CONTACT_MODEL: "FREE_THEN_PASS" }).contactModel, "FREE_THEN_PASS");
  assert.equal(c.freeContacts, 3);
  assert.equal(c.passesEnabled, false);
  assert.equal(pricingConfig({ ROOMEO_PAID_CHAT_ENABLED: "true" }).passesEnabled, true);
  assert.equal(c.passes.WEEKLY.priceInr, 149);
  assert.equal(c.passes.MONTHLY.priceInr, 299);
  assert.equal(c.passes.MONTHLY.days, 30);
  assert.equal(c.passes.SQUAD.priceInr, 99);
  assert.equal(c.boostInr, 199);
  assert.equal(c.fastTrackInr, 149);
  assert.equal(c.successFeeEnabled, false);
  assert.equal(pricingConfig({ ROOMEO_FEE_ENABLED: "true" }).successFeeEnabled, true);
  assert.equal(pricingConfig({ ROOMEO_FREE_CONTACTS: "abc" }).freeContacts, 3);
});

test("squad pass is ₹99 per member, full or split", () => {
  const c = pricingConfig({ ROOMEO_CONTACT_MODEL: "FREE_THEN_PASS" });
  assert.deepEqual(contactQuote(c, { squadMembers: 3, mode: "FULL" }), { amountInr: 297, splitParts: 0 });
  assert.deepEqual(contactQuote(c, { squadMembers: 3, mode: "SPLIT" }), { amountInr: 99, splitParts: 3 });
});

test("contact access (paid chat flag on): pass first, then free quota, then pass needed", () => {
  const c = pricingConfig({ ROOMEO_PAID_CHAT_ENABLED: "true", ROOMEO_CONTACT_MODEL: "FREE_THEN_PASS" });
  assert.deepEqual(contactAccess(c, { phoneVerified: true, freeUsed: 0, activePassId: null }), { kind: "OPEN", source: "FREE", freeLeftAfter: 2 });
  assert.deepEqual(contactAccess(c, { phoneVerified: true, freeUsed: 2, activePassId: null }), { kind: "OPEN", source: "FREE", freeLeftAfter: 0 });
  assert.deepEqual(contactAccess(c, { phoneVerified: true, freeUsed: 3, activePassId: null }), { kind: "NEED_PASS" });
  assert.deepEqual(contactAccess(c, { phoneVerified: false, freeUsed: 0, activePassId: null }), { kind: "NEED_PHONE" });
  assert.deepEqual(contactAccess(c, { phoneVerified: true, freeUsed: 1, activePassId: "p1" }), { kind: "OPEN", source: "PASS", passId: "p1" });
  assert.deepEqual(contactAccess(pricingConfig({ ROOMEO_PAID_CHAT_ENABLED: "true", ROOMEO_CONTACT_MODEL: "PER_LISTING_FEE" }), { phoneVerified: true, freeUsed: 0, activePassId: null }), { kind: "NEED_FEE" });
});

test("pass refund only when every contact failed", () => {
  assert.equal(passRefundDue([]), false);
  assert.equal(passRefundDue(["DECLINED", "NO_REPLY"]), true);
  assert.equal(passRefundDue(["DECLINED", "REPLIED"]), false);
  assert.equal(passRefundDue(["DECLINED", null]), false);
});

test("pass timing, stacking and boost extension", () => {
  const now = new Date("2026-10-28T00:00:00Z");
  const end = new Date("2026-10-30T00:00:00Z");
  assert.equal(passSettleable(end, new Date("2026-10-31T23:00:00Z"), 48), false);
  assert.equal(passSettleable(end, new Date("2026-11-01T00:00:00Z"), 48), true);
  assert.equal(passWindow(now, end, 7).end.toISOString(), "2026-11-06T00:00:00.000Z");
  assert.equal(passWindow(now, null, 7).start.toISOString(), now.toISOString());
  assert.equal(boostedUntil(now, null, 7).toISOString(), "2026-11-04T00:00:00.000Z");
  assert.equal(boostedUntil(now, end, 7).toISOString(), "2026-11-06T00:00:00.000Z");
  assert.equal(moveInConfirmed({ seekerAt: "x", ownerAt: null }), false);
  assert.equal(moveInConfirmed({ seekerAt: "x", ownerAt: "y" }), true);
});

test("squad move in needs every member and the owner; fee split per member", () => {
  assert.equal(squadMoveInConfirmed({ memberIds: ["a", "b"], confirmedIds: ["a", "b"], ownerConfirmed: true }), true);
  assert.equal(squadMoveInConfirmed({ memberIds: ["a", "b"], confirmedIds: ["a"], ownerConfirmed: true }), false);
  assert.equal(squadMoveInConfirmed({ memberIds: ["a", "b"], confirmedIds: ["a", "b"], ownerConfirmed: false }), false);
  assert.equal(squadSuccessShareInr(499, 2), 250);
  assert.equal(squadSuccessShareInr(499, 3), 167);
});

test("fee: flat ₹499 per side, not env-tunable, still OFF unless the flag is set", async () => {
  const { SUCCESS_FEE_INR } = await import("./pricing.ts");
  const c = pricingConfig({});
  assert.equal(SUCCESS_FEE_INR, 499);
  assert.equal(c.successFeeTenantInr, 499);
  assert.equal(c.successFeeOwnerInr, 499);
  assert.equal(c.successFeeEnabled, false);
  assert.equal(pricingConfig({ ROOMEO_SUCCESS_FEE_TENANT_INR: "0" }).successFeeTenantInr, 499);
});

test("success fee copy is shown up front and says one-time", async () => {
  const { successFeeHeadsUp } = await import("./pricing.ts");
  for (const r of ["tenant", "owner"] as const) {
    const t = successFeeHeadsUp(999, r);
    assert.match(t, /₹999/);
    assert.match(t, /one-time/);
    assert.match(t, /18% GST \(₹1179\)/);
    assert.match(t, /7 days/);
    assert.match(t, /no cut of/i);
  }
});

test("success fee is once per deal: an older paid fee doesn't cover a new deal", async () => {
  const { feeBelongsToDeal } = await import("./pricing.ts");
  assert.equal(feeBelongsToDeal("2026-10-29T10:00:00Z", "2026-10-29T09:00:00Z"), true);
  assert.equal(feeBelongsToDeal("2026-01-01T10:00:00Z", "2026-10-29T09:00:00Z"), false);
  assert.equal(feeBelongsToDeal(null, "2026-10-29T09:00:00Z"), false);
});
