/**
 * Owner placement commission (Rohith, 15 Nov 2026). Pure and client-safe; the SQL lives in owner-fee-db.ts.
 *
 * - Tenants pay Roomeo nothing.
 * - Owners pay 20% of one month's rent for each tenant (each bed) who moves in through Roomeo, due within
 *   7 days of the tenant's deposit/first rent (we use the move-in confirmation date), by Razorpay payment link.
 * - Founding partners (admin-set per host, with an end date, default 6 months) pay 15% instead.
 * - Attribution: the move-in is within 60 days of the tenant's first Roomeo enquiry to that host.
 * - Tenant leaves within 15 days of moving in: the owner pays only 50%. Unpaid → admin records the early exit and
 *   the amount due halves (status due_50). Already paid → 50% of the commission plus 50% of any GST is refunded
 *   (status refunded_50). Admin records both by hand.
 * - GST: OFF unless OWNER_FEE_GST_ENABLED is on. Keep it off until Athiti is GST-registered for this and the CA
 *   confirms; then 18% is added as a separate line. Off = the commission only, no GST line.
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

/**
 * 17 Nov 2026 (Rohith): the owner fee is a FLAT ₹499 per tenant (per bed) who moves in, ALL-IN, GST included,
 * replacing 20% of one month's rent. With OWNER_FEE_GST_ENABLED on the ₹499 is split ₹423 fee + ₹76 GST (whole
 * rupees, as commission rows store rupees; exact split ₹422.88 + ₹76.12); with it off the owner pays ₹499, no GST line.
 * OWNER_FEE_INR (whole rupees, GST included) overrides the amount. Founding partners pay the same flat fee
 * (the 15% founding rate no longer applies; the founding flag is kept for records).
 * Rows created under the old % model keep their stored rate and amounts.
 */
export const OWNER_FEE_FLAT_INR = 499;
export function ownerFeeFlatInr(env: Env = procEnvEarly()): number {
  const raw = env.OWNER_FEE_INR?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : OWNER_FEE_FLAT_INR;
}
function procEnvEarly(): Env {
  return typeof process !== "undefined" ? process.env : {};
}

/** Legacy % model (rows created before 17 Nov 2026). */
export const OWNER_FEE_RATE_PCT = 20;
export const FOUNDING_RATE_PCT = 15;
export const FOUNDING_MONTHS = 6;
export const OWNER_FEE_DUE_DAYS = 7;
export const ATTRIBUTION_DAYS = 60;
export const OWNER_REFUND_DAYS = 15;
export const OWNER_REFUND_PCT = 50;
/** GST rate on the commission when OWNER_FEE_GST_ENABLED is on (CA to confirm before switching it on). */
export const OWNER_FEE_GST_PCT = 18;

/** due → (due_50 if the tenant left within 15 days before payment) → paid → (refunded_50 if they left after payment). */
export type CommissionStatus = "due" | "due_50" | "paid" | "refunded_50";
export const COMMISSION_STATUSES: CommissionStatus[] = ["due", "due_50", "paid", "refunded_50"];

const procEnv = (): Env => (typeof process !== "undefined" ? process.env : {});

function flag(env: Env, k: string, def: boolean): boolean {
  const v = env[k]?.trim().toLowerCase();
  if (!v) return def;
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

/** GST % to add to new commissions: 18 when OWNER_FEE_GST_ENABLED is on, else 0 (default). */
export function ownerFeeGstPct(env: Env = procEnv()): number {
  return flag(env, "OWNER_FEE_GST_ENABLED", false) ? OWNER_FEE_GST_PCT : 0;
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
export type OwnerFeeView = { on: boolean; flatInr: number; ratePct: number; foundingPct: number; foundingMonths: number; dueDays: number; attributionDays: number; refundDays: number; refundPct: number; gstPct: number };
export const OWNER_FEE_OFF: OwnerFeeView = {
  on: false, flatInr: OWNER_FEE_FLAT_INR, ratePct: OWNER_FEE_RATE_PCT, foundingPct: FOUNDING_RATE_PCT, foundingMonths: FOUNDING_MONTHS, dueDays: OWNER_FEE_DUE_DAYS,
  attributionDays: ATTRIBUTION_DAYS, refundDays: OWNER_REFUND_DAYS, refundPct: OWNER_REFUND_PCT, gstPct: 0,
};
export function ownerFeeView(active: boolean, gstPct = 0, flatInr = OWNER_FEE_FLAT_INR): OwnerFeeView {
  return { ...OWNER_FEE_OFF, on: active, flatInr, gstPct: gstPct === OWNER_FEE_GST_PCT ? OWNER_FEE_GST_PCT : 0 };
}

/**
 * Flat owner fee for one tenant, GST included. ratePct 0 marks a flat row. gstPct > 0: GST is carved out of the
 * total (₹499 → ₹423 + ₹76), never added on top, so the owner always pays exactly the flat amount.
 */
export function flatCommissionAmounts(rentInr: number, gstPct: number = 0, totalInr: number = OWNER_FEE_FLAT_INR): CommissionAmounts {
  if (!Number.isInteger(totalInr) || totalInr <= 0) throw new Error("The flat fee should be a whole rupee amount above zero.");
  const gstInr = gstPct > 0 ? roundHalfUp(totalInr * gstPct, 100 + gstPct) : 0;
  return { rentInr: Math.max(0, Math.round(rentInr)), ratePct: 0, feeInr: totalInr - gstInr, gstPct: gstPct > 0 ? gstPct : 0, gstInr, totalInr };
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

/** Commission, plus GST as a separate line when gstPct > 0. GST is on the rounded commission, also nearest rupee. */
export function commissionAmounts(rentInr: number, ratePct: number, gstPct: number = 0): CommissionAmounts {
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

/** Tenant left within 15 days of moving in (day 15 counts, day 16 doesn't): the owner pays only 50%. */
export function refundEligible(moveInOn: string | Date, vacatedOn: string | Date): boolean {
  const d = daysBetween(moveInOn, vacatedOn);
  return d >= 0 && d <= OWNER_REFUND_DAYS;
}

/** Half of the commission plus half of any GST charged, each rounded to the nearest rupee (halves up). */
export function halfOf(feeInr: number, gstInr: number): { feeInr: number; gstInr: number; totalInr: number } {
  const f = roundHalfUp(feeInr * OWNER_REFUND_PCT, 100);
  const g = roundHalfUp(gstInr * OWNER_REFUND_PCT, 100);
  return { feeInr: f, gstInr: g, totalInr: f + g };
}

/** Refund on a paid commission (tenant left within 15 days): 50% of the commission + 50% of any GST charged. */
export function refundInr(feeInr: number, gstInr: number = 0): number {
  return halfOf(feeInr, gstInr).totalInr;
}

/** Owed after an early exit recorded before payment: the same 50% split. */
export function earlyExitDueInr(feeInr: number, gstInr: number = 0): number {
  return halfOf(feeInr, gstInr).totalInr;
}

export function canMarkPaid(status: string): boolean {
  return status === "due" || status === "due_50";
}
/** Early exit before payment: only on a full, unpaid commission. */
export function canRecordEarlyExit(status: string): boolean {
  return status === "due";
}
/** 50% refund: only on a commission paid in full (not one already halved by an early exit). */
export function canRefund50(status: string, earlyExitRecorded = false): boolean {
  return status === "paid" && !earlyExitRecorded;
}

/**
 * Payment link. This PR never talks to Razorpay: it returns a stub reference so the flow can be tested.
 * A real (test-mode first) Razorpay Payment Link call replaces this in a follow-up, after Rohith's OK.
 */
export function paymentLinkStub(commissionId: string): { mode: "stub"; ref: string; url: null } {
  return { mode: "stub", ref: `stub_plink_${commissionId.replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`, url: null };
}

/** Owner/admin-facing one-liner for a commission row. No GST line when no GST was charged. */
export function commissionLine(c: { ratePct: number | null; rentInr: number; feeInr: number; gstPct: number; gstInr: number; totalInr: number; founding: boolean }): string {
  if (!c.ratePct) return c.gstInr > 0 ? `Flat ₹${c.totalInr} per tenant, GST included (₹${c.feeInr} + ₹${c.gstInr} GST ${c.gstPct}%)` : `Flat ₹${c.totalInr} per tenant`;
  const head = `${c.ratePct}% of ₹${c.rentInr} rent${c.founding ? " (founding partner rate)" : ""} = ₹${c.feeInr}`;
  return c.gstInr > 0 ? `${head} + ₹${c.gstInr} GST (${c.gstPct}%) = ₹${c.totalInr}` : head;
}

/**
 * Clause in the SHARED deal agreement (tenant and owner both see and sign it). It never names the owner's
 * rate or amount: that is between the owner and Roomeo and shown to the owner and admins only.
 */
export function ownerFeeAgreementClause(): string {
  return "Roomeo is free for the tenant: the tenant pays Roomeo nothing. Anything the owner pays Roomeo is under Roomeo's owner terms, is separate from this agreement, and must never be passed on to the tenant as brokerage, a finder's fee or any other charge. The owner will not charge the tenant any brokerage.";
}

/** Owner-only note shown under the agreement and on the owner's request card. */
/**
 * Squad move-in: the listing's rent is for the whole unit, so each tenant's (bed's) month of rent is an equal
 * share, rounded to the nearest rupee. One commission per tenant on that share.
 */
export function squadBedRentInr(unitRentInr: number, beds: number): number {
  if (!Number.isInteger(beds) || beds < 1) return unitRentInr;
  return Math.round(unitRentInr / beds);
}

export function ownerCommissionNote(a: CommissionAmounts, beds = 1): string {
  if (!a.ratePct) {
    const incl = a.gstInr > 0 ? ` (GST included: ₹${a.feeInr} + ₹${a.gstInr} GST)` : "";
    const each = beds > 1 ? ` per tenant, for each of the ${beds} tenants (₹${a.totalInr * beds} in all)` : "";
    return `Roomeo fee (only you see this): a flat ₹${a.totalInr}${incl}${each}, due within ${OWNER_FEE_DUE_DAYS} days of the tenant's move-in, by a Razorpay payment link. If the tenant leaves within ${OWNER_REFUND_DAYS} days, you pay only ${OWNER_REFUND_PCT}% (or get ${OWNER_REFUND_PCT}% back if you've paid). Please don't charge the tenant any brokerage.`;
  }
  const amount = a.gstInr > 0 ? `₹${a.feeInr} + ₹${a.gstInr} GST (${a.gstPct}%) = ₹${a.totalInr}` : `₹${a.feeInr}`;
  const each = beds > 1 ? ` per tenant, for each of the ${beds} tenants (₹${a.rentInr} rent each; ₹${a.totalInr * beds} in all)` : "";
  return `Roomeo commission (only you see this): ${a.ratePct}% of one month's rent = ${amount}${each}, due within ${OWNER_FEE_DUE_DAYS} days of the tenant's move-in, by a Razorpay payment link. If the tenant leaves within ${OWNER_REFUND_DAYS} days, you pay only ${OWNER_REFUND_PCT}% (or get ${OWNER_REFUND_PCT}% back if you've paid). Please don't charge the tenant any brokerage.`;
}

/** What a viewer may see of the owner's commission: the owner gets the amounts, everyone else nothing. */
export function ownerFeeForViewer<T>(role: "owner" | "tenant" | "admin", amounts: T | null): T | null {
  return role === "tenant" ? null : amounts;
}
