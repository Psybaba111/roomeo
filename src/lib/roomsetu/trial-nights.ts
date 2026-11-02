/**
 * Trial nights (Rohith, 1 Nov 2026). Pure rules, no DB.
 * - Owners opt in per listing and set a nightly price.
 * - A student books 1 to 3 nights. ID is checked on arrival.
 * - Roomeo charges ₹99 per trial booking, GST included, once (not per night), via UPI + admin approval.
 * - Nightly stay money is paid directly to the owner. Roomeo never holds it.
 * - If the student's full deal is issued within 14 days of the trial, ₹99 comes off their ₹589 fee.
 */
import { GST_RATE } from "./deal-agreement.ts";

export const TRIAL_FEE_INR = 99; // GST included
export const TRIAL_MIN_NIGHTS = 1;
export const TRIAL_MAX_NIGHTS = 3;
export const TRIAL_CREDIT_WINDOW_DAYS = 14;
export const TRIAL_MAX_NIGHTLY_INR = 100000;

type Env = Record<string, string | undefined>;
const procEnv = (): Env => (typeof process !== "undefined" ? process.env : {});

/** Off by default. Only `ROOMEO_TRIAL_NIGHTS_ENABLED=true` (or 1/on/yes) turns booking on. */
export function trialNightsEnabled(env: Env = procEnv()): boolean {
  const v = env.ROOMEO_TRIAL_NIGHTS_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

/** GST-inclusive split in paise: ₹99 = ₹83.90 taxable + ₹15.10 GST (18%). Parts always add up exactly. */
export function inclusiveGstSplit(totalInr: number): { total: number; base: number; gst: number; basePaise: number; gstPaise: number } {
  const totalPaise = Math.round(totalInr * 100);
  const basePaise = Math.round(totalPaise / (1 + GST_RATE));
  const gstPaise = totalPaise - basePaise;
  return { total: totalPaise / 100, base: basePaise / 100, gst: gstPaise / 100, basePaise, gstPaise };
}

export function trialFeeBreakdown() {
  return inclusiveGstSplit(TRIAL_FEE_INR);
}

export function trialFeeText(): string {
  const f = trialFeeBreakdown();
  return `₹${f.total} incl. GST (₹${f.base.toFixed(2)} + ₹${f.gst.toFixed(2)} GST at 18%), once per trial booking`;
}

export function validNights(n: unknown): number {
  const v = typeof n === "string" ? Number(n) : n;
  if (typeof v !== "number" || !Number.isInteger(v) || v < TRIAL_MIN_NIGHTS || v > TRIAL_MAX_NIGHTS)
    throw new Error(`A trial is ${TRIAL_MIN_NIGHTS} to ${TRIAL_MAX_NIGHTS} nights.`);
  return v;
}

export function validNightlyPrice(n: unknown): number {
  const v = typeof n === "string" ? Number(n.trim()) : n;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > TRIAL_MAX_NIGHTLY_INR)
    throw new Error("Set a nightly price in whole rupees (₹1 to ₹1,00,000).");
  return v;
}

/** Check-in must be a real YYYY-MM-DD date, today or later (India date), and within 60 days. */
export function validCheckIn(d: unknown, todayIst: string): string {
  const s = typeof d === "string" ? d.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new Error("Pick a check-in date.");
  const diff = (Date.parse(s) - Date.parse(todayIst)) / 86_400_000;
  if (diff < 0) throw new Error("Check-in can't be in the past.");
  if (diff > 60) throw new Error("Trials can be booked up to 60 days ahead.");
  return s;
}

/** Stay money the student pays the owner directly (not Roomeo). */
export function trialStayTotal(nightlyInr: number, nights: number): number {
  return validNightlyPrice(nightlyInr) * validNights(nights);
}

/** Day after the last trial night (YYYY-MM-DD). */
export function trialCheckOut(checkIn: string, nights: number): string {
  return new Date(Date.parse(checkIn) + nights * 86_400_000).toISOString().slice(0, 10);
}

/**
 * A paid trial earns the ₹99 credit if the deal is issued no later than 14 days after check-out
 * (and not before the trial was booked). Dates compared as India calendar dates.
 */
export function trialCreditEligible(p: { checkIn: string; nights: number; bookedOn: string; dealIssuedOn: string }): boolean {
  const out = Date.parse(trialCheckOut(p.checkIn, p.nights));
  const issued = Date.parse(p.dealIssuedOn);
  if (issued < Date.parse(p.bookedOn)) return false;
  return (issued - out) / 86_400_000 <= TRIAL_CREDIT_WINDOW_DAYS;
}

/** Tenant fee after the trial credit. Never below zero. */
export function feeAfterTrialCredit(feeTotalInr: number, credit: boolean): { amount: number; credit: number } {
  const c = credit ? Math.min(TRIAL_FEE_INR, feeTotalInr) : 0;
  return { amount: feeTotalInr - c, credit: c };
}

/** Shown to the student before and after booking. */
export const TRIAL_ARRIVAL_CHECKLIST = [
  "Carry a government photo ID (Aadhaar, passport, driving licence or college ID). The owner checks it on arrival.",
  "Pay the nightly stay amount directly to the owner. Roomeo never holds it.",
  `Up to ${TRIAL_MAX_NIGHTS} nights per trial.`,
  `The ₹${TRIAL_FEE_INR} trial fee is non-refundable.`,
  `Stay on: sign the full deal within ${TRIAL_CREDIT_WINDOW_DAYS} days of your trial and the ₹${TRIAL_FEE_INR} comes off your ₹589 fee (one time only, not given back if that fee is later refunded).`,
] as const;
