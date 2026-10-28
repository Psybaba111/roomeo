import test from "node:test";
import assert from "node:assert/strict";
import {
  allSaidYes,
  contactFeeInr,
  contactNeedsPayment,
  joinBlocker,
  makeInviteCode,
  parseSquadInput,
  whatsappShareUrl,
} from "./contact.ts";

test("contact fee env with ₹499 default", () => {
  assert.equal(contactFeeInr({}), 499);
  assert.equal(contactFeeInr({ ROOMEO_CONTACT_FEE: "299" }), 299);
  assert.equal(contactFeeInr({ ROOMEO_CONTACT_FEE: "abc" }), 499);
  assert.equal(contactFeeInr({ ROOMEO_CONTACT_FEE: "-5" }), 499);
  assert.equal(contactFeeInr({ ROOMEO_CONTACT_FEE: "4.5" }), 499);
});

test("hosts never pay; seekers pay once per listing", () => {
  assert.equal(
    contactNeedsPayment({ viewerId: "h", ownerId: "h", unlocked: false, existingThread: false }),
    false,
  );
  assert.equal(
    contactNeedsPayment({ viewerId: "s", ownerId: "h", unlocked: false, existingThread: false }),
    true,
  );
  assert.equal(
    contactNeedsPayment({ viewerId: "s", ownerId: "h", unlocked: true, existingThread: false }),
    false,
  );
  assert.equal(
    contactNeedsPayment({ viewerId: "s", ownerId: "h", unlocked: false, existingThread: true }),
    false,
  );
});

test("squad input", () => {
  assert.deepEqual(
    parseSquadInput({
      name: " Flat  hunters ",
      area: "HSR Layout",
      budgetPerPerson: 12000,
      moveIn: "2026-12-01",
      size: 3,
    }),
    {
      name: "Flat hunters",
      area: "HSR Layout",
      budgetPerPerson: 12000,
      moveIn: "2026-12-01",
      size: 3,
    },
  );
  assert.throws(() =>
    parseSquadInput({ name: "A team", area: "HSR", budgetPerPerson: 12000, size: 5 }),
  );
  assert.throws(() =>
    parseSquadInput({ name: "A team", area: "HSR", budgetPerPerson: 12000, size: 1 }),
  );
  assert.throws(() =>
    parseSquadInput({ name: "A team", area: "HSR", budgetPerPerson: 50, size: 2 }),
  );
});

test("join rules", () => {
  const b = {
    phoneVerified: true,
    activeMembers: 1,
    size: 3,
    alreadyMember: false,
    status: "OPEN",
  };
  assert.equal(joinBlocker(b), null);
  assert.match(joinBlocker({ ...b, phoneVerified: false })!, /phone/);
  assert.match(joinBlocker({ ...b, activeMembers: 3 })!, /full/);
  assert.equal(joinBlocker({ ...b, activeMembers: 3, alreadyMember: true }), null);
});

test("all yes needs a full squad and every member", () => {
  assert.equal(allSaidYes({ size: 3, memberIds: ["a", "b", "c"], yesIds: ["a", "b", "c"] }), true);
  assert.equal(allSaidYes({ size: 3, memberIds: ["a", "b", "c"], yesIds: ["a", "b"] }), false);
  assert.equal(allSaidYes({ size: 3, memberIds: ["a", "b"], yesIds: ["a", "b"] }), false);
});

test("invite code + whatsapp url", () => {
  assert.match(makeInviteCode(), /^[a-z2-9]{10}$/);
  assert.equal(whatsappShareUrl("Join a b"), "https://wa.me/?text=Join%20a%20b");
});

import { contactRefundDue } from "./contact.ts";
test("refund only when owner declines a not-yet-accepted proposal", () => {
  assert.equal(contactRefundDue({ decision: "DECLINED", previousStatus: "PENDING" }), true);
  assert.equal(contactRefundDue({ decision: "DECLINED", previousStatus: "VISIT_PROPOSED" }), true);
  assert.equal(contactRefundDue({ decision: "DECLINED", previousStatus: "ACCEPTED" }), false);
  assert.equal(contactRefundDue({ decision: "DECLINED", previousStatus: "DECLINED" }), false);
  assert.equal(contactRefundDue({ decision: "WITHDRAWN", previousStatus: "PENDING" }), false);
  assert.equal(contactRefundDue({ decision: "ACCEPTED", previousStatus: "PENDING" }), false);
});

test("visit proposed then declined is still refunded", () => {
  assert.equal(contactRefundDue({ decision: "DECLINED", previousStatus: "VISIT_PROPOSED" }), true);
  assert.equal(contactRefundDue({ decision: "DECLINED", previousStatus: "ACCEPTED" }), false);
});
