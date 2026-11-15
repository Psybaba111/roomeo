/**
 * Every user-facing line that mentions the Roomeo success fee, built from the fee
 * setting (`pricingConfig().successFeeEnabled`, env `ROOMEO_FEE_ENABLED`, OFF by
 * default). Pure and client-safe: server code turns the config into a `FeeView`
 * (`feeViewOf`), routes get it from their loader, and nothing hard-codes ₹499/₹589.
 *
 * While the fee is OFF no line may show a fee amount (code review, 14 Nov 2026).
 */
import { feeWithGst } from "./deal-agreement.ts";

export type FeeView = {
  /** Fee is switched on (collection live). */
  on: boolean;
  /** Per-side base fee before GST, ₹. 0 when off. */
  baseInr: number;
  /** Base + 18% GST, rounded to whole rupees. 0 when off. */
  totalInr: number;
};

/** Fail-safe default: no fee. */
export const FEE_OFF: FeeView = { on: false, baseInr: 0, totalInr: 0 };

export function feeViewOf(cfg: { successFeeEnabled: boolean; successFeeTenantInr: number }): FeeView {
  if (!cfg.successFeeEnabled || !(cfg.successFeeTenantInr > 0)) return FEE_OFF;
  return { on: true, baseInr: cfg.successFeeTenantInr, totalInr: feeWithGst(cfg.successFeeTenantInr).total };
}

/** Coerce loader data (may be missing or stale) into a FeeView, defaulting to OFF. */
export function asFeeView(v: unknown): FeeView {
  const f = v as Partial<FeeView> | null | undefined;
  if (!f || f.on !== true || !(Number(f.baseInr) > 0)) return FEE_OFF;
  const baseInr = Number(f.baseInr);
  return { on: true, baseInr, totalInr: Number(f.totalInr) > 0 ? Number(f.totalInr) : feeWithGst(baseInr).total };
}

export const FREE_PILOT = "Free while we pilot";

/** Home hero line (was money.ts FEE_LINE). */
export function feeLine(f: FeeView): string {
  return f.on
    ? `Browse and chat free. ₹${f.totalInr} (₹${f.baseInr} + GST) once when you lock a bed, refundable within 7 days.`
    : `Browse, chat and lock a bed free. ${FREE_PILOT}: no Roomeo fee for renters or owners.`;
}

/** Home "how it works" step 3 body. */
export function homeChatStep(f: FeeView): string {
  return f.on
    ? `Unlimited owner chats, free. Listing is free too. When a stay is locked, renter and owner each pay ₹${f.totalInr} (₹${f.baseInr} + GST) once, refundable within 7 days.`
    : "Unlimited owner chats, free. Listing is free too. No Roomeo fee while we pilot. Rent and deposit go straight to the owner.";
}

/** Line under the price on a listing (was booking-cta.ts FEE_UNDER_PRICE). */
export function feeUnderPrice(f: FeeView): string {
  return f.on
    ? `₹${f.totalInr} one-time Roomeo fee, only after the owner says yes · rent & deposit go straight to the owner`
    : "No Roomeo fee while we pilot · rent & deposit go straight to the owner";
}

/** Shown where the exact address is still hidden (was location-gate.ts LOCKED_LOCATION_LINE). */
export function lockedLocationLine(f: FeeView): string {
  return f.on
    ? `Exact location unlocks after you lock the bed (₹${f.totalInr} paid) and sign the agreement 📍`
    : "Exact location unlocks once you and the owner both sign the agreement 📍";
}

/** City search meta description tail. */
export function cityFeeTail(f: FeeView): string {
  return f.on ? `Chat free, ₹${f.totalInr} once when you lock a bed.` : "Chat free. No Roomeo fee while we pilot.";
}

/** Referral invite page (r.$code) head description and body. */
export function inviteDescription(f: FeeView): string {
  return f.on
    ? `Find a verified shared room or PG bed. Chat free, ₹${f.baseInr} + GST (₹${f.totalInr}) once when you lock a bed, not a broker's month.`
    : "Find a verified shared room or PG bed. Chat free, and no Roomeo fee while we pilot. Not a broker's month.";
}
export function inviteBody(f: FeeView): string {
  return f.on
    ? `Make an account, find your bed, move in. Chat free; you pay ₹${f.baseInr} + GST (₹${f.totalInr}) once when you lock a bed. Zero broker fees.`
    : "Make an account, find your bed, move in. Chat free, no Roomeo fee while we pilot. Zero broker fees.";
}

/** OG share card price label/note. */
export function ogFeeLabel(f: FeeView): { priceLabel: string; priceNote: string } {
  return f.on ? { priceLabel: `₹${f.baseInr} once`, priceNote: "not a broker's month" } : { priceLabel: "Free to use", priceNote: "while we pilot" };
}

/** Trial-night "stay on" credit line; null when there is no fee to credit against. */
export function trialCreditLine(f: FeeView, trialFeeInr: number, windowDays: number): string | null {
  if (!f.on) return null;
  return `Stay on: sign the full deal within ${windowDays} days of your trial and the ₹${trialFeeInr} comes off your ₹${f.totalInr} fee (one time only, not given back if that fee is later refunded).`;
}

/** Message when card/UPI rent checkout is unavailable. */
export function rentPartnerMissingLine(f: FeeView): string {
  return f.on
    ? `UPI or card needs the payments partner keys. The fee is ₹${f.baseInr} once, on the first month.`
    : "UPI or card needs the payments partner keys. There is no Roomeo fee right now.";
}

export type PricingCopy = {
  headTitle: string;
  h1: string;
  sub: string;
  planPrice: string;
  planNote: string;
  tagline: [string, string];
  faq: [string, string][];
};

/** /pricing page copy (hero, plan cards, tagline and fee FAQs). */
export function pricingCopy(f: FeeView, trial: { feeInr: number; windowDays: number }): PricingCopy {
  if (!f.on) {
    return {
      headTitle: "Pricing: free while we pilot, not a broker's month",
      h1: "Free while we pilot. Not a broker's month.",
      sub: "No Roomeo fee for renters or owners right now. Rent and deposit go straight to the owner. No chat passes. No cut of your rent.",
      planPrice: "₹0",
      planNote: FREE_PILOT,
      tagline: ["Free while we pilot.", "Not a broker's month."],
      faq: [
        ["What does Roomeo cost?", "Nothing right now. Searching, chatting, squads, listing and locking a bed are free while we pilot. If that ever changes, the price is shown with GST before anyone signs or pays, and it never applies to a stay that's already confirmed."],
        [`Is the ₹${trial.feeInr} trial night fee refundable?`, `No. The ₹${trial.feeInr} trial fee is never refunded. Monthly rent then goes straight to the owner.`],
      ],
    };
  }
  const refundAfterCredit = f.totalInr - trial.feeInr;
  return {
    headTitle: `Pricing: ₹${f.baseInr} once, not a broker's month`,
    h1: `₹${f.baseInr} once. Not a broker's month.`,
    sub: `₹${f.baseInr} + GST from the renter and ₹${f.baseInr} + GST from the owner, once per stay. Refunded if the renter moves out within 7 days of paying. No chat passes. No cut of your rent.`,
    planPrice: `₹${f.baseInr} once`,
    planNote: `plus 18% GST (₹${f.totalInr} total)`,
    tagline: [`₹${f.baseInr} once.`, "Not a broker's month."],
    faq: [
      ["What does Roomeo cost?", `₹${f.baseInr} + 18% GST (₹${f.totalInr}) once. The renter pays it once and the owner pays it once, per person, per stay. Not every month, and not a cut of the rent. Searching, chatting, squads and listing are free.`],
      ["Is the fee refundable?", `Only if the renter moves out within 7 days of paying it. Then the renter's ₹${f.totalInr} (or ₹${refundAfterCredit} after a trial credit) is refunded to the UPI ID that paid, and the owner's fee too if the stay ended within 7 days of the owner's payment. After that, no refund.`],
      [`Is the ₹${trial.feeInr} trial night fee refundable?`, `No. The ₹${trial.feeInr} trial fee is never refunded. If you stay on and sign within ${trial.windowDays} days of your trial, it comes off your ₹${f.totalInr} fee once, so you pay ₹${refundAfterCredit}, then monthly rent goes straight to the owner.`],
      [`Why ₹${f.baseInr}?`, `A broker usually takes a month's rent. ₹${f.baseInr} once beats that on any bed. The next months cost no fee.`],
    ],
  };
}

/** Pricing page trial bullet about the credit; null while the fee is off. */
export function pricingTrialCreditBullet(f: FeeView, trialFeeInr: number, windowDays: number): string | null {
  if (!f.on) return null;
  const left = f.totalInr - trialFeeInr;
  return `Sign the full deal within ${windowDays} days of your trial and the ₹${trialFeeInr} comes off your ₹${f.totalInr} fee, so you pay ₹${left}. Then pay your monthly rent straight to the owner. The credit is used once; if the ₹${f.totalInr} fee is later refunded under the 7-day rule, you get the ₹${left} you paid back, not the ₹${trialFeeInr}.`;
}

/** True if `text` names a success-fee amount (₹499 / ₹589 style) — used by the fee-off tests. */
export function mentionsFeeAmount(text: string, f: { baseInr: number; totalInr: number } = { baseInr: 499, totalInr: 589 }): boolean {
  return new RegExp(`₹\\s?(${f.baseInr}|${f.totalInr})(?!\\d)`).test(text);
}
