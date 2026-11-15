/**
 * Owner placement commission (Rohith, 15 Nov 2026). Pure and client-safe; the SQL lives in owner-fee-db.ts.
 *
 * - Tenants pay Roomeo nothing.
 * - Owners pay 20% of one month's rent for each tenant who moves in through Roomeo, plus GST, due within
 *   7 days of the tenant's deposit/first rent (we use the move-in confirmation date), by Razorpay payment link.
 * - Founding partners (admin-set per host, with an end date, default 6 months) pay 15% instead.
 * - Attribution: the move-in is within 60 days of the tenant's first Roomeo enquiry to that host.
 * - Tenant leaves within 15 days of moving in: 50% of the commission (and its GST) is refunded. Admin records it.
 *
 * Behind OWNER_FEE_ENABLED (default OFF). It only becomes *active* while the legacy flat success fee is OFF,
 * so an owner is never asked for both the ₹499 + GST success fee and a commission.
 *
 * Day rule (all dates are India calendar dates, the enquiry day is day 0):
 *   days = moveInOn − firstEnquiryOn. Attributed when 0 ≤ days ≤ 60. Day 59 and day 60 count, day 61 doesn't.
 * Rounding rule: every rupee amount is rounded to the nearest whole rupee, halves up.
 *   20% of ₹5,999 = 1,199.80 → ₹1,200. 15% of ₹5,999 = 899.85 → ₹900. 50% of ₹1,001 = 500.5 → ₹501.
 */
export type Env = Record<string, string | undefined>;

export const OWNER_FEE_RATE_PCT = 20;
export const FOUNDING_RATE_PCT = 15;
export const FOUNDING_MONTHS = 6;
export const OWNER_FEE_DUE_DAYS = 7;
export const ATTRIBUTION_DAYS = 60;
export const OWNER_REFUND_DAYS = 15;
export const OWNER_REFUND_PCT = 50;
/** GST on the commission, shown separately. 18% (SAC 9985 support services) is an assumption to confirm. */
export const OWNER_FEE_GST_PCT = 18;

export type CommissionStatus = "due" | "paid" | "refunded_50";
export const COMMISSION_STATUSES: CommissionStatus[] = ["due", "paid", "refunded_50"];

const procEnv = (): Env => (typeof process !== "undefined" ? process.env : {});

function flag(env: Env, k: string, def: boolean): boolean {
  const v = env[k]?.trim().toLowerCase();
  if (!v) return def;
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

/** The raw switch. Default OFF. */
export function ownerFeeFlag(env: Env = procEnv()): boolean {
  return flag(env, "OWNER_FEE_ENABLED", false);
}

export type OwnerFeeState = { flag: boolean; active: boolean; blockedByTenantFee: boolean };

/** Active only when the switch is on AND the legacy flat success fee is off (no double charge). */
export function ownerFeeState(successFeeEnabled: boolean, env: Env = procEnv()): OwnerFeeState {
  const f = ownerFeeFlag(env);
  return { flag: f, active: f && !successFeeEnabled, blockedByTenantFee: f && successFeeEnabled };
}

/** What owner-facing copy needs. `on` is the *active* state. */
export type OwnerFeeView = { on: boolean; ratePct: number; foundingPct: number; foundingMonths: number; dueDays: number; attributionDays: number; refundDays: number; refundPct: number; gstPct: number };
export const OWNER_FEE_OFF: OwnerFeeView = {
  on: false, ratePct: OWNER_FEE_RATE_PCT, foundingPct: FOUNDING_RATE_PCT, foundingMonths: FOUNDING_MONTHS, dueDays: OWNER_FEE_DUE_DAYS,
  attributionDays: ATTRIBUTION_DAYS, refundDays: OWNER_REFUND_DAYS, refundPct: OWNER_REFUND_PCT, gstPct: OWNER_FEE_GST_PCT,
};
export function ownerFeeView(active: boolean): OwnerFeeView {
  return { ...OWNER_FEE_OFF, on: active };
}

/** Round to the nearest whole rupee, halves up, using integer maths (no float drift). `num/den` ≥ 0. */
function roundHalfUp(num: number, den: number): number {
  return Math.floor((num * 2 + den) / (den * 2));
}

/** Commission on one month's rent at a whole-number percentage, nearest rupee (halves up). */
export function commissionInr(rentInr: number, ratePct: number): number {
  if (!Number.isInteger(rentInr) || rentInr <= 0) throw new Error("Rent should be a whole rupee amount above zero.");
  if (!Number.isInteger(ratePct) || ratePct < 1 || ratePct > 100) throw new Error("Rate should be a whole percentage.");
  return roundHalfUp(rentInr * ratePct, 100);
}

export type CommissionAmounts = { rentInr: number; ratePct: number; feeInr: number; gstPct: number; gstInr: number; totalInr: number };

/** Commission plus GST, shown as separate lines. GST is on the rounded commission, also nearest rupee. */
export function commissionAmounts(rentInr: number, ratePct: number, gstPct: number = OWNER_FEE_GST_PCT): CommissionAmounts {
  const feeInr = commissionInr(rentInr, ratePct);
  const gstInr = gstPct > 0 ? roundHalfUp(feeInr * gstPct, 100) : 0;
  return { rentInr, ratePct, feeInr, gstPct, gstInr, totalInr: feeInr + gstInr };
}

const DAY = 86_400_000;
const IST_MS = 330 * 60_000;
const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** India calendar date for an instant or a YYYY-MM-DD string (returned as-is). */
export function istYmd(at: string | Date): string {
  if (typeof at === "string" && isYmd(at)) return at;
  const t = typeof at === "string" ? Date.parse(at) : at.getTime();
  if (Number.isNaN(t)) throw new Error("Bad date.");
  return new Date(t + IST_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (India dates). */
export function daysBetween(from: string | Date, to: string | Date): number {
  return Math.round((Date.parse(istYmd(to)) - Date.parse(istYmd(from))) / DAY);
}

export function addDays(ymd: string, days: number): string {
  return new Date(Date.parse(istYmd(ymd)) + days * DAY).toISOString().slice(0, 10);
}

/** Same day N months later, clamped to the month's last day (31 Aug + 6 → 28/29 Feb). */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = istYmd(ymd).split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Attribution: move-in on day 0..60 after the first enquiry (enquiry day = day 0). Day 61 is out. */
export function attributed(firstEnquiryAt: string | Date | null | undefined, moveInOn: string | Date): { ok: boolean; days: number | null } {
  if (!firstEnquiryAt) return { ok: false, days: null };
  const days = daysBetween(firstEnquiryAt, moveInOn);
  return { ok: days >= 0 && days <= ATTRIBUTION_DAYS, days };
}

export type HostFeeSetting = { foundingPartner: boolean; foundingUntil: string | null };

/** 15% while the host is a founding partner and the move-in is on or before the end date, else 20%. */
export function rateFor(host: HostFeeSetting | null | undefined, moveInOn: string | Date): { ratePct: number; founding: boolean } {
  if (host?.foundingPartner && host.foundingUntil && istYmd(moveInOn) <= istYmd(host.foundingUntil)) return { ratePct: FOUNDING_RATE_PCT, founding: true };
  return { ratePct: OWNER_FEE_RATE_PCT, founding: false };
}

/** Default founding end date: 6 months from the day the admin sets it. */
export function defaultFoundingUntil(setOn: string | Date): string {
  return addMonths(istYmd(setOn), FOUNDING_MONTHS);
}

/** Due 7 days after the tenant's deposit / first rent (the move-in confirmation date). */
export function commissionDueOn(basisOn: string | Date): string {
  return addDays(istYmd(basisOn), OWNER_FEE_DUE_DAYS);
}

/** 50% back if the tenant leaves within 15 days of moving in (day 15 counts, day 16 doesn't). */
export function refundEligible(moveInOn: string | Date, vacatedOn: string | Date): boolean {
  const d = daysBetween(moveInOn, vacatedOn);
  return d >= 0 && d <= OWNER_REFUND_DAYS;
}

/** 50% of what the owner paid (commission + GST), nearest rupee, halves up. */
export function refundInr(totalInr: number): number {
  return roundHalfUp(totalInr * OWNER_REFUND_PCT, 100);
}

export function canMarkPaid(status: string): boolean {
  return status === "due";
}
export function canRefund50(status: string): boolean {
  return status === "paid";
}

/**
 * Payment link. This PR never talks to Razorpay: it returns a stub reference so the flow can be tested.
 * A real (test-mode first) Razorpay Payment Link call replaces this in a follow-up, after Rohith's OK.
 */
export function paymentLinkStub(commissionId: string): { mode: "stub"; ref: string; url: null } {
  return { mode: "stub", ref: `stub_plink_${commissionId.replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`, url: null };
}

/** Owner-facing one-liner for a commission row. */
export function commissionLine(c: { ratePct: number; rentInr: number; feeInr: number; gstPct: number; gstInr: number; totalInr: number; founding: boolean }): string {
  return `${c.ratePct}% of ₹${c.rentInr} rent${c.founding ? " (founding partner rate)" : ""} = ₹${c.feeInr} + ₹${c.gstInr} GST (${c.gstPct}%) = ₹${c.totalInr}`;
}

/** Agreement clause (owner side) for the owner-fee model. */
export function ownerFeeAgreementClause(ratePct: number, rentInr: number): string {
  const a = commissionAmounts(rentInr, ratePct);
  return `Roomeo is free for the tenant. The owner pays Roomeo a placement commission of ${ratePct}% of one month's rent (₹${a.feeInr}) plus GST as applicable, for this tenant, due within ${OWNER_FEE_DUE_DAYS} days of the tenant's deposit or first rent, by a Razorpay payment link. If the tenant leaves within ${OWNER_REFUND_DAYS} days of moving in, ${OWNER_REFUND_PCT}% of it is refunded to the owner. The owner will not charge the tenant any brokerage.`;
}
