import { ownerFeeAgreementClause } from "./owner-fee.ts";

/** Pure helpers for the one-time success fee (GST-inclusive since 17 Nov 2026, only while it is switched on) and the click-to-sign deal agreement. */
export const GST_RATE = 0.18;
export const REFUND_WINDOW_DAYS = 7;

/** ₹999 + 18% GST = ₹1,178.82, charged as ₹1,179 (UPI amounts are whole rupees here; rounded half-up). */
export function feeWithGst(baseInr: number): { base: number; gst: number; exact: number; total: number } {
  const gstPaise = Math.round(baseInr * 100 * GST_RATE);
  const exactPaise = baseInr * 100 + gstPaise;
  return { base: baseInr, gst: gstPaise / 100, exact: exactPaise / 100, total: Math.round(exactPaise / 100) };
}

/**
 * The success fee is GST-inclusive (Rohith, 17 Nov 2026: "₹499 all-in including GST"). Split in paise so the
 * parts always add up to the total exactly: ₹499 = ₹422.88 taxable + ₹76.12 GST (CGST ₹38.06 + SGST ₹38.06).
 * Same shape as feeWithGst so callers can switch: `base` is the taxable value, `total` what is charged.
 */
export function successFeeSplit(totalInr: number): { base: number; gst: number; exact: number; total: number; totalPaise: number; basePaise: number; gstPaise: number; cgstPaise: number; sgstPaise: number } {
  const totalPaise = Math.round(totalInr * 100);
  const basePaise = Math.round(totalPaise / (1 + GST_RATE));
  const gstPaise = totalPaise - basePaise;
  const cgstPaise = Math.floor(gstPaise / 2);
  return { base: basePaise / 100, gst: gstPaise / 100, exact: totalPaise / 100, total: totalPaise / 100, totalPaise, basePaise, gstPaise, cgstPaise, sgstPaise: gstPaise - cgstPaise };
}

/** Pre-17 Nov 2026 wording (base + GST, rounded), kept for agreements created under that model. */
export function legacyFeeBreakdownText(baseInr: number): string {
  const f = feeWithGst(baseInr);
  return `₹${f.base} + ₹${f.gst.toFixed(2)} GST (18%) = ₹${f.exact.toFixed(2)}, rounded to ₹${f.total}`;
}

/** "₹499 incl. 18% GST (₹422.88 + ₹76.12 GST)". */
export function feeBreakdownText(totalInr: number): string {
  const f = successFeeSplit(totalInr);
  return `₹${f.total} incl. 18% GST (₹${f.base.toFixed(2)} + ₹${f.gst.toFixed(2)} GST)`;
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
  /**
   * Per-side success fee, ₹. 0 while the fee is off: the agreement then has no fee clauses.
   * With feeInclGst (agreements created from 17 Nov 2026) this is the all-in amount incl. GST (₹499);
   * older agreements stored the pre-GST base (₹499 + GST = ₹589). Stored bodies are never re-rendered.
   */
  feeBaseInr: number;
  feeInclGst?: boolean;
  /** Owner-fee model is active: add the tenant-safe "free for the tenant, no brokerage" clause. It never names the owner's rate or amount. */
  ownerFee?: boolean;
};

/** Fee base written into a new agreement: the tenant fee while the success fee is ON, else 0. */
export function agreementFeeBaseInr(cfg: { successFeeEnabled: boolean; successFeeTenantInr: number }): number {
  return cfg.successFeeEnabled && cfg.successFeeTenantInr > 0 ? cfg.successFeeTenantInr : 0;
}

export function agreementBody(t: DealTerms): string {
  const feeClauses =
    t.feeBaseInr > 0
      ? [
          `Both sides pay Roomeo a one-time platform success fee of ${t.feeInclGst ? feeBreakdownText(t.feeBaseInr) : legacyFeeBreakdownText(t.feeBaseInr)} each, once this agreement is issued and before move in.`,
          `Roomeo's fee is refunded only if the tenant vacates within ${REFUND_WINDOW_DAYS} days of paying it. The owner's fee is refunded too if the stay ends within ${REFUND_WINDOW_DAYS} days of the owner's payment. Otherwise the fee is not refundable. The deposit is paid directly to the owner and Roomeo never holds or refunds it.`,
        ]
      : t.ownerFee
        ? [ownerFeeAgreementClause()]
        : [];
  const clauses = [
    `The tenant takes the room above at the rent and deposit shown. Rent and deposit are paid directly to the owner; Roomeo never holds them or takes a cut.`,
    ...feeClauses,
    `House rules, notice period and anything else are between tenant and owner. A full stamped rental agreement may still be needed under local law.`,
    `This agreement is signed by each side clicking "Sign" in Roomeo. Roomeo records the typed name, time and IP address of each signature. The issue date is when the second side signs.`,
  ];
  return [
    `ROOMEO DEAL AGREEMENT`,
    ``,
    `Tenant: ${t.tenantName}`,
    `Owner: ${t.ownerName}`,
    `Room: ${t.listingTitle}, ${roomPlace(t)}`,
    `Monthly rent: ₹${t.monthlyRent}. Deposit: ₹${t.deposit}.${t.moveIn ? ` Planned move in: ${t.moveIn}.` : ""}`,
    ``,
    ...clauses.map((c, i) => `${i + 1}. ${c}`),
  ].join("\n");
}

/**
 * Until the agreement is issued (everyone signed), the street address stays out of the text.
 * People see the area ("Bunder, Mangaluru"); the issued copy carries the full address.
 */
/** "1 Test Lane, Kadri, Mangaluru": locality/city are added only if the address doesn't already say them (case-insensitive). */
export function roomPlace(t: { address: string; locality: string; city: string }): string {
  const address = (t.address || "").trim();
  const low = address.toLowerCase();
  const extra = [t.locality, t.city].map((x) => (x || "").trim()).filter((x) => x && !low.includes(x.toLowerCase()));
  return [address, ...extra].filter(Boolean).join(", ");
}

export function agreementBodyForView(body: string, t: { address: string; locality: string; city: string }, issued: boolean): string {
  const street = (t.address || "").trim();
  if (!street) return body;
  // Older drafts repeated the area ("…, Kadri, Mangaluru, Kadri, Mangaluru"). Show them deduped too.
  const legacy = [street, t.locality, t.city].filter(Boolean).join(", ");
  const place = roomPlace(t);
  let out = legacy !== place ? body.split(legacy).join(place) : body;
  if (issued) return out;
  const area = [t.locality, t.city].filter(Boolean).join(", ") || "Area shown after signing";
  out = out.split(place).join(`${area} (street address shared once the agreement is signed)`);
  return out.split(street).join(area);
}
