import { createHmac, timingSafeEqual } from "node:crypto";

export function razorpaySignatureMatches(secret: string, orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
