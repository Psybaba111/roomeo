import test from "node:test";
import assert from "node:assert/strict";
import { decisionBlocker, isSelfDecision, selfDecisionAudit, SELF_DECISION_WARNING } from "./host-review.ts";

const self = { actorId: "u1", targetId: "u1", identitySource: "", reviewStatus: "PENDING", decision: "APPROVE" as const };

test("ADMIN and plain users cannot self-decide", () => {
  assert.equal(decisionBlocker({ ...self, actorRoles: ["ADMIN"], reason: "long enough" }), "You cannot decide your own ID.");
  assert.equal(decisionBlocker({ ...self, actorRoles: ["HOST"], reason: "long enough" }), "You cannot decide your own ID.");
  assert.equal(decisionBlocker({ ...self, reason: "long enough" }), "You cannot decide your own ID.");
});

test("SUPER_ADMIN can self-decide only with a reason", () => {
  assert.match(decisionBlocker({ ...self, actorRoles: ["HOST", "SUPER_ADMIN"] }) ?? "", /needs a reason/);
  assert.match(decisionBlocker({ ...self, actorRoles: ["SUPER_ADMIN"], reason: " ab " }) ?? "", /needs a reason/);
  assert.equal(decisionBlocker({ ...self, actorRoles: ["SUPER_ADMIN"], reason: "Checked my Aadhaar" }), null);
  assert.equal(decisionBlocker({ ...self, decision: "REJECT", actorRoles: ["SUPER_ADMIN"], reason: "Wrong last 4" }), null);
});

test("other rules still apply to a SUPER_ADMIN self-decision", () => {
  assert.ok(decisionBlocker({ ...self, reviewStatus: "", actorRoles: ["SUPER_ADMIN"], reason: "Checked my ID" }));
  assert.ok(decisionBlocker({ ...self, identitySource: "DIGILOCKER", actorRoles: ["SUPER_ADMIN"], reason: "Checked my ID" }));
});

test("deciding someone else is unchanged", () => {
  assert.equal(decisionBlocker({ ...self, targetId: "u2", actorRoles: ["ADMIN"] }), null);
});

test("self-decision audit entry", () => {
  assert.equal(isSelfDecision("a", "a"), true);
  assert.equal(isSelfDecision("a", "b"), false);
  const a = selfDecisionAudit("APPROVE", "  Checked my Aadhaar ");
  assert.equal(a.action, "HOST_ID_SELF_APPROVED");
  assert.match(a.detail, /SELF-DECISION.*actor = subject.*Reason: Checked my Aadhaar$/);
  assert.equal(selfDecisionAudit("REJECT", "x").action, "HOST_ID_SELF_REJECTED");
  assert.match(SELF_DECISION_WARNING, /YOUR OWN ID/);
});
