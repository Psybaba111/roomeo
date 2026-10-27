import test from "node:test";
import assert from "node:assert/strict";
import { buildUpiLink, makeRef, rateLimited, submitUtrInput, upiPayee, utrSchema } from "./upi.ts";

test("upi link carries payee, amount, currency and ref", () => {
  const link = buildUpiLink({ vpa: "roomeo@okicici", name: "Roomeo Spaces", amountInr: 499, ref: "RMABCDEFGH" });
  assert.ok(link.startsWith("upi://pay?"));
  const q = new URLSearchParams(link.slice("upi://pay?".length));
  assert.equal(q.get("pa"), "roomeo@okicici");
  assert.equal(q.get("pn"), "Roomeo Spaces");
  assert.equal(q.get("am"), "499.00");
  assert.equal(q.get("cu"), "INR");
  assert.equal(q.get("tr"), "RMABCDEFGH");
  assert.ok(!link.includes("+"));
});

test("upi link rejects bad vpa or amount", () => {
  assert.throws(() => buildUpiLink({ vpa: "not a vpa", name: "R", amountInr: 499, ref: "RMABCDEFGH" }));
  assert.throws(() => buildUpiLink({ vpa: "a@ybl", name: "R", amountInr: 0, ref: "RMABCDEFGH" }));
  assert.throws(() => buildUpiLink({ vpa: "a@ybl", name: "R", amountInr: 4.5, ref: "RMABCDEFGH" }));
});

test("refs are short, prefixed and unambiguous", () => {
  const ref = makeRef();
  assert.match(ref, /^RM[A-Z2-9]{8}$/);
  assert.doesNotMatch(ref.slice(2), /[01IO]/);
  assert.equal(makeRef(() => new Uint8Array(8)), "RMAAAAAAAA");
});

test("utr must be exactly 12 digits, spaces tolerated", () => {
  assert.equal(utrSchema.parse("4123 4567 8901"), "412345678901");
  for (const bad of ["12345678901", "1234567890123", "41234567890a", ""]) {
    assert.equal(utrSchema.safeParse(bad).success, false, bad);
  }
  assert.equal(submitUtrInput.safeParse({ ref: "RMABCDEFGH", utr: "412345678901" }).success, true);
  assert.equal(submitUtrInput.safeParse({ ref: "x'; drop", utr: "412345678901" }).success, false);
});

test("payee needs a valid vpa from env", () => {
  assert.equal(upiPayee({}).ready, false);
  assert.equal(upiPayee({ ROOMEO_UPI_VPA: "roomeo@okhdfcbank" }).ready, true);
  assert.equal(upiPayee({ ROOMEO_UPI_VPA: "roomeo@okhdfcbank" }).name, "Roomeo");
});

test("rate limit trips at the cap", () => {
  assert.equal(rateLimited(4), false);
  assert.equal(rateLimited(5), true);
});
