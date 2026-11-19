/**
 * Every user-facing line that mentions the Roomeo success fee, built from the fee
 * setting (`pricingConfig().successFeeEnabled`, env `ROOMEO_FEE_ENABLED`, OFF by
 * default). Pure and client-safe: server code turns the config into a `FeeView`
 * (`feeViewOf`), routes get it from their loader, and nothing hard-codes ₹499/₹589.
 *
 * While the fee is OFF no line may show a fee amount (code review, 14 Nov 2026).
 */
import { successFeeSplit } from "./deal-agreement.ts";
import { OWNER_FEE_OFF, ownerFeeFlatInr, ownerFeeGstPct, ownerFeeState, ownerFeeView, type OwnerFeeView } from "./owner-fee.ts";

export type FeeView = {
  /** Fee is switched on (collection live). */
  on: boolean;
  /** Taxable value of the per-side fee, ₹ (₹422.88 of ₹499). 0 when off. */
  baseInr: number;
  /** What each side pays, GST included (₹499). 0 when off. */
  totalInr: number;
  /** Owner commission model (OWNER_FEE_ENABLED). Missing = off. Only ever on while the tenant fee is off. */
  owner?: OwnerFeeView;
};

export const ownerOf = (f: FeeView): OwnerFeeView => f.owner ?? OWNER_FEE_OFF;

/** Fail-safe default: no fee. */
export const FEE_OFF: FeeView = { on: false, baseInr: 0, totalInr: 0 };

export function feeViewOf(cfg: { successFeeEnabled: boolean; successFeeTenantInr: number }, env?: Record<string, string | undefined>): FeeView {
  if (!cfg.successFeeEnabled || !(cfg.successFeeTenantInr > 0)) {
    const owner = ownerFeeView(ownerFeeState(false, env).active, ownerFeeGstPct(env), ownerFeeFlatInr(env));
    return owner.on ? { ...FEE_OFF, owner } : FEE_OFF;
  }
  const f = successFeeSplit(cfg.successFeeTenantInr);
  // Tenant fee on AND owner fee on (owner pays only after the deposit + rent advance): carry the owner view too.
  const owner = ownerFeeView(ownerFeeState(true, env).active, ownerFeeGstPct(env), ownerFeeFlatInr(env));
  return owner.on ? { on: true, baseInr: f.base, totalInr: f.total, owner } : { on: true, baseInr: f.base, totalInr: f.total };
}

/** Tenant fee on and the owner pays after the deposit (OWNER_FEE_ENABLED). */
export const ownerAfterDeposit = (f: FeeView): boolean => f.on && ownerOf(f).on;

/** Coerce loader data (may be missing or stale) into a FeeView, defaulting to OFF. */
export function asFeeView(v: unknown): FeeView {
  const f = v as Partial<FeeView> | null | undefined;
  if (!f || f.on !== true || !(Number(f.baseInr) > 0)) {
    const o = f?.owner as Partial<OwnerFeeView> | undefined;
    return o && o.on === true ? { ...FEE_OFF, owner: ownerFeeView(true, Number(o.gstPct) || 0, Number(o.flatInr) > 0 ? Number(o.flatInr) : undefined) } : FEE_OFF;
  }
  const baseInr = Number(f.baseInr);
  const o = f.owner as Partial<OwnerFeeView> | undefined;
  const owner = o && o.on === true ? ownerFeeView(true, Number(o.gstPct) || 0, Number(o.flatInr) > 0 ? Number(o.flatInr) : undefined) : undefined;
  return { on: true, baseInr, totalInr: Number(f.totalInr) > 0 ? Number(f.totalInr) : Math.round(baseInr * 1.18), ...(owner ? { owner } : {}) };
}

export const FREE_PILOT = "Free while we pilot";
/** Tenant-facing line wherever the tenant fee would show while it is off (owner-fee model, 15 Nov 2026). */
export const FREE_TENANTS = "Free for tenants";

/** Home hero line (was money.ts FEE_LINE). */
export function feeLine(f: FeeView): string {
  return f.on
    ? `Browse and chat free. ₹${f.totalInr} (incl. GST) once when you lock a bed, refundable within 7 days.`
    : `${FREE_TENANTS}: browse, chat and lock a bed with no Roomeo fee.`;
}

/** Home "how it works" step 3 body. */
export function homeChatStep(f: FeeView): string {
  return ownerAfterDeposit(f)
    ? `Unlimited owner chats, free. Listing is free too. When a stay is locked, the renter pays ₹${f.totalInr} (incl. GST) once, refundable within 7 days. Owners pay ₹${ownerOf(f).flatInr} only after they've received the deposit and rent advance and Roomeo checks it.`
    : f.on
    ? `Unlimited owner chats, free. Listing is free too. When a stay is locked, renter and owner each pay ₹${f.totalInr} (incl. GST) once, refundable within 7 days.`
    : ownerOf(f).on
      ? `Unlimited owner chats, free. ${FREE_TENANTS}. Listing is free; owners pay Roomeo a flat ₹${ownerOf(f).flatInr} (GST included) only after they've received the tenant's deposit and rent advance and Roomeo checks it. Rent and deposit go straight to the owner.`
      : `Unlimited owner chats, free. Listing is free too. ${FREE_TENANTS}: no Roomeo fee. Rent and deposit go straight to the owner.`;
}

/** Line under the price on a listing (was booking-cta.ts FEE_UNDER_PRICE). */
export function feeUnderPrice(f: FeeView): string {
  return f.on
    ? `₹${f.totalInr} one-time Roomeo fee, only after the owner says yes · rent & deposit go straight to the owner`
    : `${FREE_TENANTS} · no Roomeo fee · rent & deposit go straight to the owner`;
}

/** Shown where the exact address is still hidden (was location-gate.ts LOCKED_LOCATION_LINE). */
export function lockedLocationLine(f: FeeView): string {
  return f.on
    ? `Exact location unlocks after you lock the bed (₹${f.totalInr} paid) and sign the agreement 📍`
    : "Exact location unlocks once you and the owner both sign the agreement 📍";
}

/** City search meta description tail. */
export function cityFeeTail(f: FeeView): string {
  return f.on ? `Chat free, ₹${f.totalInr} once when you lock a bed.` : `Chat free. ${FREE_TENANTS}.`;
}

/** Referral invite page (r.$code) head description and body. */
export function inviteDescription(f: FeeView): string {
  return f.on
    ? `Find a verified shared room or PG bed. Chat free, ₹${f.totalInr} (incl. GST) once when you lock a bed, not a broker's month.`
    : `Find a verified shared room or PG bed. Chat free. ${FREE_TENANTS}, not a broker's month.`;
}
export function inviteBody(f: FeeView): string {
  return f.on
    ? `Make an account, find your bed, move in. Chat free; you pay ₹${f.totalInr} (incl. GST) once when you lock a bed. Zero broker fees.`
    : `Make an account, find your bed, move in. Chat free. ${FREE_TENANTS}. Zero broker fees.`;
}

/** OG share card price label/note. */
export function ogFeeLabel(f: FeeView): { priceLabel: string; priceNote: string } {
  return f.on ? { priceLabel: `₹${f.totalInr} once`, priceNote: "not a broker's month" } : { priceLabel: FREE_TENANTS, priceNote: "not a broker's month" };
}

/** Trial-night "stay on" credit line; null when there is no fee to credit against. */
export function trialCreditLine(f: FeeView, trialFeeInr: number, windowDays: number): string | null {
  if (!f.on) return null;
  return `Stay on: sign the full deal within ${windowDays} days of your trial and the ₹${trialFeeInr} comes off your ₹${f.totalInr} fee (one time only, not given back if that fee is later refunded).`;
}

/** Message when card/UPI rent checkout is unavailable. */
export function rentPartnerMissingLine(f: FeeView): string {
  return f.on
    ? `UPI or card needs the payments partner keys. The fee is ₹${f.totalInr} (incl. GST) once, on the first month.`
    : `UPI or card needs the payments partner keys. ${FREE_TENANTS}: there is no Roomeo fee.`;
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
    const o = ownerOf(f);
    return {
      headTitle: "Pricing: free for tenants, not a broker's month",
      h1: `${FREE_TENANTS}. Not a broker's month.`,
      sub: o.on
        ? `Tenants pay Roomeo nothing. Owners pay a flat ₹${o.flatInr}, GST included, only after they've received a Roomeo tenant's deposit and rent advance and Roomeo checks it (₹0 for founding partners). Rent and deposit go straight to the owner. No chat passes.`
        : "No Roomeo fee for renters or owners right now. Rent and deposit go straight to the owner. No chat passes. No cut of your rent.",
      planPrice: "₹0",
      planNote: FREE_TENANTS,
      tagline: [`${FREE_TENANTS}.`, "Not a broker's month."],
      faq: [
        o.on
          ? ["What does Roomeo cost?", `Nothing for tenants. Searching, chatting, squads and locking a bed are free. Owners list free and pay Roomeo a flat ₹${o.flatInr} per tenant${o.gstPct ? ` (${o.gstPct}% GST included, shown separately on the invoice)` : ""}, ₹0 for founding partners, only for a tenant who pays them the deposit and rent advance within ${o.attributionDays} days of their first Roomeo enquiry. It's charged only after the owner marks the deposit and advance as received and Roomeo checks it, never upfront, and is due within ${o.dueDays} days of that check by a Razorpay payment link.`]
          : ["What does Roomeo cost?", "Nothing right now. Searching, chatting, squads, listing and locking a bed are free while we pilot. If that ever changes, the price is shown with GST before anyone signs or pays, and it never applies to a stay that's already confirmed."],
        ...(o.on
          ? ([
              ["Is the owner commission refundable?", `If the tenant leaves within ${o.refundDays} days of moving in, the owner pays only ${o.refundPct}%: half is waived if it isn't paid yet, or ${o.refundPct}% of the commission${o.gstPct ? " and its GST" : ""} goes back if it is. After that, no refund.`],
              ["Can an owner charge me brokerage?", "No. Owners on Roomeo agree not to charge Roomeo tenants any brokerage. Report it if anyone asks."],
            ] as [string, string][])
          : []),
        [`Is the ₹${trial.feeInr} trial night fee refundable?`, `No. The ₹${trial.feeInr} trial fee is never refunded. Monthly rent then goes straight to the owner.`],
      ],
    };
  }
  const refundAfterCredit = f.totalInr - trial.feeInr;
  const od = ownerAfterDeposit(f);
  const ownerFlat = ownerOf(f).flatInr;
  return {
    headTitle: `Pricing: ₹${f.totalInr} once, not a broker's month`,
    h1: `₹${f.totalInr} once. Not a broker's month.`,
    sub: od
      ? `₹${f.totalInr} from the renter, once per stay, GST included, refunded if the renter moves out within 7 days of paying. Owners pay ₹${ownerFlat} only after they've received the deposit and rent advance and Roomeo checks it (₹0 for founding partners). No chat passes. No cut of your rent.`
      : `₹${f.totalInr} from the renter and ₹${f.totalInr} from the owner, once per stay, GST included. Refunded if the renter moves out within 7 days of paying. No chat passes. No cut of your rent.`,
    planPrice: `₹${f.totalInr} once`,
    planNote: `all-in, 18% GST included (₹${f.baseInr.toFixed(2)} + ₹${(f.totalInr - f.baseInr).toFixed(2)} GST)`,
    tagline: [`₹${f.totalInr} once.`, "Not a broker's month."],
    faq: [
      od
        ? ["What does Roomeo cost?", `₹${f.totalInr} once, 18% GST included, from the renter, per stay. Owners pay ₹${ownerFlat} once per tenant, only after they've received the tenant's deposit and rent advance and Roomeo checks it, never upfront, never at listing time. Founding partners pay ₹0. Not every month, and not a cut of the rent. Searching, chatting, squads and listing are free.`]
        : ["What does Roomeo cost?", `₹${f.totalInr} once, 18% GST included. The renter pays it once and the owner pays it once, per person, per stay. Not every month, and not a cut of the rent. Searching, chatting, squads and listing are free.`],
      ["Is the fee refundable?", `Only if the renter moves out within 7 days of paying it. Then the renter's ₹${f.totalInr} (or ₹${refundAfterCredit} after a trial credit) is refunded to the UPI ID that paid, and the owner's fee too if the stay ended within 7 days of the owner's payment. After that, no refund.`],
      [`Is the ₹${trial.feeInr} trial night fee refundable?`, `No. The ₹${trial.feeInr} trial fee is never refunded. If you stay on and sign within ${trial.windowDays} days of your trial, it comes off your ₹${f.totalInr} fee once, so you pay ₹${refundAfterCredit}, then monthly rent goes straight to the owner.`],
      [`Why ₹${f.totalInr}?`, `A broker usually takes a month's rent. ₹${f.totalInr} once, GST included, beats that on any bed. The next months cost no fee.`],
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
