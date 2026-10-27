import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { FEE_INR, rentQuote } from "./money.ts";
import { razorpaySignatureMatches } from "./razorpay.ts";

test("rent quote adds 499 for the seeker and takes 499 from the host", () => {
  const quote = rentQuote(12000, 24000);
  assert.equal(FEE_INR, 499);
  assert.equal(quote.seekerPays, 12499);
  assert.equal(quote.hostReceives, 11501);
  assert.equal(quote.seekerFee, 499);
  assert.equal(quote.hostFee, 499);
});

test("razorpay signature accepts the order and payment pair only", () => {
  const secret = "test-secret";
  const good = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");
  assert.equal(razorpaySignatureMatches(secret, "order_1", "pay_1", good), true);
  assert.equal(razorpaySignatureMatches(secret, "order_1", "pay_1", "nope"), false);
  assert.equal(razorpaySignatureMatches(secret, "order_1", "pay_2", good), false);
});
