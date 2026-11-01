/** Pure helpers for the one-time fee (₹499 + 18% GST) and the click-to-sign deal agreement. */
export const GST_RATE = 0.18;
export const REFUND_WINDOW_DAYS = 7;

/** ₹999 + 18% GST = ₹1,178.82, charged as ₹1,179 (UPI amounts are whole rupees here; rounded half-up). */
export function feeWithGst(baseInr: number): { base: number; gst: number; exact: number; total: number } {
  const gstPaise = Math.round(baseInr * 100 * GST_RATE);
  const exactPaise = baseInr * 100 + gstPaise;
  return { base: baseInr, gst: gstPaise / 100, exact: exactPaise / 100, total: Math.round(exactPaise / 100) };
}

export function feeBreakdownText(baseInr: number): string {
  const f = feeWithGst(baseInr);
  return `₹${f.base} + ₹${f.gst.toFixed(2)} GST (18%) = ₹${f.exact.toFixed(2)}, rounded to ₹${f.total}`;
}

/** Calendar date (YYYY-MM-DD) in India for an instant. */
export function istDate(at: string | Date): string {
  const t = typeof at === "string" ? Date.parse(at) : at.getTime();
  return new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * Refund rule (Rohith, 1 Nov 2026): a paid fee is refunded only if the renter vacates (the stay ends)
 * within 7 days of that fee's payment. Compared as India calendar dates: paid on 1 Nov → vacate by 8 Nov.
 * A move-out on or before the payment date also counts (the stay never really started).
 */
export function refundableOnVacate(paidAt: string | Date | null | undefined, vacatedOn: string | Date): boolean {
  if (!paidAt) return false;
  const v = typeof vacatedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(vacatedOn) ? vacatedOn : istDate(vacatedOn);
  const days = (Date.parse(v) - Date.parse(istDate(paidAt))) / 86_400_000;
  return days <= REFUND_WINDOW_DAYS;
}

/** Last India date a move-out still earns a refund, for a fee paid at `paidAt`. */
export function refundDeadline(paidAt: string | Date): string {
  return new Date(Date.parse(istDate(paidAt)) + REFUND_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
}

export type AgreementState = "DRAFT" | "WAITING" | "ISSUED" | "CANCELLED";
export function agreementState(a: { seekerSignedAt?: string | null; ownerSignedAt?: string | null; issuedAt?: string | null; cancelledAt?: string | null }): AgreementState {
  if (a.cancelledAt) return "CANCELLED";
  if (a.issuedAt) return "ISSUED";
  if (a.seekerSignedAt || a.ownerSignedAt) return "WAITING";
  return "DRAFT";
}

export function validSignName(name: unknown): string {
  const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (n.length < 2 || n.length > 80) throw new Error("Type your full name to sign (2–80 characters).");
  return n;
}

export type DealTerms = {
  listingTitle: string;
  address: string;
  city: string;
  locality: string;
  monthlyRent: number;
  deposit: number;
  moveIn: string;
  tenantName: string;
  ownerName: string;
  feeBaseInr: number;
};

export function agreementBody(t: DealTerms): string {
  const fee = feeBreakdownText(t.feeBaseInr);
  return [
    `ROOMEO DEAL AGREEMENT`,
    ``,
    `Tenant: ${t.tenantName}`,
    `Owner: ${t.ownerName}`,
    `Room: ${t.listingTitle}, ${[t.address, t.locality, t.city].filter(Boolean).join(", ")}`,
    `Monthly rent: ₹${t.monthlyRent}. Deposit: ₹${t.deposit}.${t.moveIn ? ` Planned move in: ${t.moveIn}.` : ""}`,
    ``,
    `1. The tenant takes the room above at the rent and deposit shown. Rent and deposit are paid directly to the owner; Roomeo never holds them or takes a cut.`,
    `2. Both sides pay Roomeo a one-time platform success fee of ${fee} each, once this agreement is issued and before move in.`,
    `3. Roomeo's fee is refunded only if the tenant vacates within ${REFUND_WINDOW_DAYS} days of paying it. The owner's fee is refunded too if the stay ends within ${REFUND_WINDOW_DAYS} days of the owner's payment. Otherwise the fee is not refundable. The deposit is paid directly to the owner and Roomeo never holds or refunds it.`,
    `4. House rules, notice period and anything else are between tenant and owner. A full stamped rental agreement may still be needed under local law.`,
    `5. This agreement is signed by each side clicking "Sign" in Roomeo. Roomeo records the typed name, time and IP address of each signature. The issue date is when the second side signs.`,
  ].join("\n");
}
