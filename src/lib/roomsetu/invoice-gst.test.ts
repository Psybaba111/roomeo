import { test } from "node:test";
import assert from "node:assert/strict";
import { buyerState, invoiceAmounts, invoicePdfLines, istInvoiceDate, normalizeGstin, stateForGstin, type InvoiceView } from "./invoice.ts";
import { submitUtrInput } from "./upi.ts";

test("₹589 paid in Karnataka: 499 + CGST 44.91 + SGST 44.91, round off +0.18", () => {
  const a = invoiceAmounts(499, null, 589);
  assert.deepEqual([a.taxable, a.cgst, a.sgst, a.igst, a.total, a.roundOff, a.paid], [49900, 4491, 4491, 0, 58882, 18, 58900]);
  assert.equal(a.placeOfSupply, "Karnataka");
});
test("other state → IGST 89.82", () => {
  const a = invoiceAmounts(499, "Kerala", 589);
  assert.deepEqual([a.cgst, a.sgst, a.igst, a.roundOff], [0, 0, 8982, 18]);
  assert.equal(a.placeOfSupply, "Kerala");
});
test("GSTIN validation and state", () => {
  assert.equal(normalizeGstin(" 29abfca1830k1zm "), "29ABFCA1830K1ZM");
  assert.equal(normalizeGstin("29ABFCA1830K1Z"), null);
  assert.equal(normalizeGstin("99ABFCA1830K1ZM"), null);
  assert.equal(stateForGstin("32AAAAA0000A1Z5"), "Kerala");
  assert.equal(buyerState("32AAAAA0000A1Z5", "Mangaluru"), "Kerala");
  assert.equal(buyerState(null, "Mangaluru"), "Karnataka");
  assert.equal(buyerState(null, "Nowhere"), null);
  assert.equal(submitUtrInput.parse({ ref: "RMABCDEFGH", utr: "412345678901", gstin: "29abfca1830k1zm" }).gstin, "29ABFCA1830K1ZM");
  assert.equal(submitUtrInput.parse({ ref: "RMABCDEFGH", utr: "412345678901", gstin: "" }).gstin, undefined);
  assert.throws(() => submitUtrInput.parse({ ref: "RMABCDEFGH", utr: "412345678901", gstin: "nope" }));
});
test("invoice date is IST (late UTC evening rolls to next day)", () => {
  assert.equal(istInvoiceDate("2026-10-31T20:00:00Z"), "01 Nov 2026");
});
test("PDF lines carry every required field", () => {
  const v: InvoiceView = { number: "RMO/2026-27/000001", issuedAt: "2026-11-01T06:00:00Z", buyerName: "ZZ Renter", buyerEmail: "zz@example.com", buyerPhone: "+919999999999", buyerGstin: "",
    buyerState: "Karnataka", placeOfSupply: "Karnataka", taxable: 49900, cgst: 4491, sgst: 4491, igst: 0, total: 58882, roundOff: 18, paidInr: 589, ref: "RMABCDEFGH", utr: "412345678901", purpose: "x" };
  const s = invoicePdfLines(v).map((l) => l.text).join("\n");
  for (const want of ["TAX INVOICE", "RMO/2026-27/000001", "01 Nov 2026 (IST)", "Athiti Hospitality Services Private Limited", "29ABFCA1830K1ZM", "62 MPT Road, Bunder, Mangaluru 575001", "zz@example.com", "+919999999999",
    "Not provided", "Place of supply: Karnataka", "SAC 998599", "₹499.00", "CGST @ 9%: ₹44.91", "SGST @ 9%: ₹44.91", "₹588.82", "Round off: ₹0.18", "₹589.00", "UTR: 412345678901"]) assert.ok(s.includes(want), want);
  assert.ok(!s.includes("IGST"));
});
