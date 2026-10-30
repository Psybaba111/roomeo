import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canClaim,
  completionCredits,
  isMissingTable,
  makeReferralCode,
  normalizeCode,
  referralLink,
  referralShareText,
  referralsEnabled,
  REFERRAL_CREDIT_INR,
} from "./referrals.ts";

test("referrals are OFF unless the flag is set", () => {
  assert.equal(referralsEnabled({}), false);
  assert.equal(referralsEnabled({ ROOMEO_REFERRALS_ENABLED: "false" }), false);
  assert.equal(referralsEnabled({ ROOMEO_REFERRALS_ENABLED: "true" }), true);
  assert.equal(referralsEnabled({ ROOMEO_REFERRALS_ENABLED: " ON " }), true);
});

test("codes are 7 chars, no look-alike characters, and round-trip through normalize", () => {
  for (let i = 0; i < 200; i++) {
    const c = makeReferralCode();
    assert.match(c, /^[A-HJ-NP-Z2-9]{7}$/);
    assert.equal(normalizeCode(c.toLowerCase()), c);
  }
  assert.equal(normalizeCode("ABC0OI1"), null);
  assert.equal(normalizeCode("short"), null);
  assert.equal(normalizeCode(42), null);
});

test("link and WhatsApp text carry the code and the ₹500", () => {
  const link = referralLink("https://roomeo.app/", "ABCDEFG");
  assert.equal(link, "https://roomeo.app/r/ABCDEFG");
  const t = referralShareText(link);
  assert.ok(t.includes(link));
  assert.ok(t.includes(`₹${REFERRAL_CREDIT_INR}`));
});

test("claim rules block self, repeats, stale accounts and post-move-in", () => {
  const now = new Date("2026-10-30T00:00:00Z");
  const base = { refereeId: "b", referrerId: "a", alreadyReferred: false, accountCreatedAt: new Date("2026-10-29T00:00:00Z"), hasMovedIn: false, now };
  assert.deepEqual(canClaim(base), { ok: true });
  assert.deepEqual(canClaim({ ...base, referrerId: null }), { ok: false, reason: "UNKNOWN_CODE" });
  assert.deepEqual(canClaim({ ...base, referrerId: "b" }), { ok: false, reason: "SELF" });
  assert.deepEqual(canClaim({ ...base, alreadyReferred: true }), { ok: false, reason: "ALREADY_REFERRED" });
  assert.deepEqual(canClaim({ ...base, hasMovedIn: true }), { ok: false, reason: "ALREADY_MOVED_IN" });
  assert.deepEqual(canClaim({ ...base, accountCreatedAt: new Date("2026-10-01T00:00:00Z") }), { ok: false, reason: "TOO_LATE" });
});

test("a completed referral gives both people ₹500, once each", () => {
  const c = completionCredits({ id: "r1", referrerId: "a", refereeId: "b" });
  assert.equal(c.length, 2);
  assert.deepEqual(c.map((x) => x.userId).sort(), ["a", "b"]);
  assert.ok(c.every((x) => x.amountInr === 500 && x.referralId === "r1"));
});

test("missing-table errors are recognised so the feature hides before migration 0017", () => {
  assert.equal(isMissingTable({ code: "42P01" }), true);
  assert.equal(isMissingTable(new Error('relation "referrals" does not exist')), true);
  assert.equal(isMissingTable(new Error("boom")), false);
});
