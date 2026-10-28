import test from "node:test";
import assert from "node:assert/strict";
import {
  decisionBlocker,
  hostReviewMessage,
  parseHostDecision,
  parseIdSubmission,
} from "./host-review.ts";

test("ID submission keeps only last 4 and validates type", () => {
  assert.deepEqual(
    parseIdSubmission({ docType: "aadhaar", last4: "12ab", nameOnId: " Asha  Rao " }),
    { docType: "AADHAAR", last4: "12AB", nameOnId: "Asha Rao" },
  );
  assert.throws(() => parseIdSubmission({ docType: "X", last4: "1234", nameOnId: "Asha" }));
  assert.throws(() =>
    parseIdSubmission({ docType: "PAN", last4: "123456789012", nameOnId: "Asha" }),
  );
  assert.throws(() => parseIdSubmission({ docType: "PAN", last4: "1234", nameOnId: "" }));
});

test("reject needs a reason, approve does not", () => {
  assert.equal(
    parseHostDecision({ userId: "abcdefgh12", decision: "APPROVE" }).decision,
    "APPROVE",
  );
  assert.throws(() => parseHostDecision({ userId: "abcdefgh12", decision: "REJECT", reason: "" }));
  assert.equal(
    parseHostDecision({ userId: "abcdefgh12", decision: "REJECT", reason: "Name mismatch" }).reason,
    "Name mismatch",
  );
  assert.throws(() => parseHostDecision({ userId: "x';drop", decision: "APPROVE" }));
});

test("decision blockers", () => {
  const base = {
    actorId: "a",
    targetId: "b",
    identitySource: "",
    reviewStatus: "PENDING",
    decision: "APPROVE" as const,
  };
  assert.equal(decisionBlocker(base), null);
  assert.ok(decisionBlocker({ ...base, targetId: "a" }));
  assert.ok(decisionBlocker({ ...base, identitySource: "DIGILOCKER" }));
  assert.ok(decisionBlocker({ ...base, reviewStatus: "" }));
  assert.equal(decisionBlocker({ ...base, reviewStatus: "", decision: "REJECT" }), null);
});

test("host status messages", () => {
  assert.equal(
    hostReviewMessage({
      identityStatus: "VERIFIED",
      identitySource: "STAFF",
      reviewStatus: "APPROVED",
      note: "",
    }).tone,
    "ok",
  );
  assert.equal(
    hostReviewMessage({
      identityStatus: "UNVERIFIED",
      identitySource: "",
      reviewStatus: "PENDING",
      note: "",
    }).tone,
    "wait",
  );
  assert.match(
    hostReviewMessage({
      identityStatus: "UNVERIFIED",
      identitySource: "",
      reviewStatus: "REJECTED",
      note: "Blurry",
    }).text,
    /Blurry/,
  );
});
