import test from "node:test";
import assert from "node:assert/strict";
import { badgeStatus, formatIst, idDocLabel, idReviewView } from "./host-review.ts";

const base = { identityStatus: "UNVERIFIED", identitySource: "", reviewStatus: "", note: "", docType: "", last4: "", nameOnId: "", submittedAt: "", phoneVerified: false };

test("pending shows saved type and last 4, hides the form", () => {
  const v = idReviewView({ ...base, reviewStatus: "PENDING", docType: "AADHAAR", last4: "1619", nameOnId: "Rohith rao", submittedAt: "2026-10-29 16:53:43.386+00" });
  assert.equal(v.kind, "pending");
  assert.equal(v.showForm, false);
  if (v.kind === "pending") {
    assert.equal(v.docLabel, "Aadhaar");
    assert.equal(v.last4, "1619");
  }
});

test("approved: badge only with phone verified", () => {
  const a = idReviewView({ ...base, identityStatus: "VERIFIED", identitySource: "STAFF", reviewStatus: "APPROVED" });
  assert.deepEqual(a, { kind: "approved", showForm: false, verifiedBadge: false, via: "STAFF" });
  const b = idReviewView({ ...base, identityStatus: "VERIFIED", identitySource: "DIGILOCKER", phoneVerified: true });
  assert.equal(b.kind === "approved" && b.verifiedBadge, true);
});

test("rejected shows reason and allows resubmit; nothing submitted shows form", () => {
  assert.deepEqual(idReviewView({ ...base, reviewStatus: "REJECTED", note: "Name mismatch" }), { kind: "rejected", showForm: true, reason: "Name mismatch" });
  assert.deepEqual(idReviewView(base), { kind: "none", showForm: true });
});

test("badge needs both checks", () => {
  assert.equal(badgeStatus(true, true), "VERIFIED");
  assert.equal(badgeStatus(true, false), "UNVERIFIED");
  assert.equal(badgeStatus(false, true), "UNVERIFIED");
});

test("labels and IST time", () => {
  assert.equal(idDocLabel("PAN"), "PAN card");
  assert.equal(idDocLabel(""), "ID");
  assert.match(formatIst("2026-10-29 16:53:43.386+00"), /10:23\s?pm IST/i);
  assert.equal(formatIst(""), "");
  assert.equal(formatIst("nope"), "");
});
