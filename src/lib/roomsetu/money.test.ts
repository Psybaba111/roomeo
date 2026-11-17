import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { FEE_INR, rentQuote } from "./money.ts";
import { FEE_OFF, feeLine } from "./fee-copy.ts";
import { razorpaySignatureMatches } from "./razorpay.ts";

test("rent quote adds nothing while the fee is off (default)", () => {
  for (const quote of [rentQuote(12000, 24000), rentQuote(12000, 24000, true, false)]) {
    assert.equal(quote.seekerPays, 12000);
    assert.equal(quote.hostReceives, 12000);
    assert.equal(quote.seekerFee, 0);
    assert.equal(quote.hostFee, 0);
  }
});

test("rent quote adds 499 for the seeker and takes 499 from the host when the fee is on", () => {
  const quote = rentQuote(12000, 24000, true, true);
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

test("rent quote: no fee after the first month, even when on", () => {
  assert.equal(rentQuote(12000, 24000, false, true).seekerFee, 0);
});

test("one fee line: chat free, ₹499 incl GST once, 7 day refund (fee on); no amounts when off", () => {
  const on = feeLine({ on: true, baseInr: 422.88, totalInr: 499 });
  assert.match(on, /chat free/i);
  assert.ok(on.includes("₹499 (incl. GST)") && !on.includes("₹589"));
  assert.match(on, /7 days/);
  assert.equal(Math.round(FEE_INR * 1.18), 589);
  const off = feeLine(FEE_OFF);
  assert.match(off, /chat/i);
  assert.match(off, /free for tenants/i);
  assert.doesNotMatch(off, /₹\d/);
});
