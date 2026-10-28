import test from "node:test";
import assert from "node:assert/strict";
import { contactQuote, pricingConfig, squadShareInr, squadUnlockReady } from "./pricing.ts";
import { containsContactDetails } from "./contact.ts";

test("pricing defaults keep ₹499 per listing", () => {
  const cfg = pricingConfig({});
  assert.equal(cfg.contactModel, "PER_LISTING_FEE");
  assert.deepEqual(contactQuote(cfg, {}), { amountInr: 499, splitParts: 0 });
  assert.deepEqual(contactQuote(cfg, { squadMembers: 3, mode: "FULL" }), { amountInr: 499, splitParts: 0 });
});

test("squad split shares round up", () => {
  assert.equal(squadShareInr(499, 3), 167);
  assert.equal(squadShareInr(499, 2), 250);
  assert.equal(squadShareInr(500, 4), 125);
  assert.deepEqual(contactQuote(pricingConfig({}), { squadMembers: 4, mode: "SPLIT" }), { amountInr: 125, splitParts: 4 });
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
