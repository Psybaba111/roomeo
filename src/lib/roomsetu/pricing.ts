// Single place for how seekers pay to contact owners, and for host extras.
// Launch model (FREE_THEN_PASS): 3 free owner contacts per verified seeker, then a weekly or
// monthly pass for unlimited contacts, ₹99 per member for squads. The old one time fee per listing
// (PER_LISTING_FEE, ₹499) stays available for rollback via ROOMEO_CONTACT_MODEL.
import { contactFeeInr } from "./contact.ts";

export type ContactModel = "FREE_THEN_PASS" | "PER_LISTING_FEE";
export type SquadPayMode = "FULL" | "SPLIT";
export type PassCode = "WEEKLY" | "MONTHLY" | "SQUAD";
export type Env = Record<string, string | undefined>;

export type PassPlan = { code: PassCode; name: string; priceInr: number; days: number; perMember: boolean };

export type PricingConfig = {
  contactModel: ContactModel;
  contactFeeInr: number;
  squadSplitEnabled: boolean;
  freeContacts: number;
  passesEnabled: boolean;
  passes: Record<PassCode, PassPlan>;
  noReplyHours: number;
  boostInr: number;
  boostDays: number;
  fastTrackInr: number;
  successFeeEnabled: boolean;
  successFeeTenantInr: number;
  successFeeOwnerInr: number;
};

const procEnv = (): Env => (typeof process !== "undefined" ? process.env : {});

function int(env: Env, k: string, def: number, min: number, max: number): number {
  const raw = env[k]?.trim();
  if (!raw) return def;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
}
function flag(env: Env, k: string, def: boolean): boolean {
  const v = env[k]?.trim().toLowerCase();
  if (!v) return def;
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

export function pricingConfig(env: Env = procEnv()): PricingConfig {
  const model = env.ROOMEO_CONTACT_MODEL?.trim().toUpperCase() === "PER_LISTING_FEE" ? "PER_LISTING_FEE" : "FREE_THEN_PASS";
  const squadDays = int(env, "ROOMEO_SQUAD_PASS_DAYS", 30, 1, 365);
  return {
    contactModel: model,
    contactFeeInr: contactFeeInr(env),
    squadSplitEnabled: env.ROOMEO_SQUAD_SPLIT?.trim().toLowerCase() !== "false",
    freeContacts: int(env, "ROOMEO_FREE_CONTACTS", 3, 0, 100),
    passesEnabled: flag(env, "ROOMEO_PASSES_ENABLED", true),
    passes: {
      WEEKLY: { code: "WEEKLY", name: "Weekly pass", priceInr: int(env, "ROOMEO_WEEKLY_PASS_INR", 149, 1, 100000), days: 7, perMember: false },
      MONTHLY: { code: "MONTHLY", name: "Monthly pass", priceInr: int(env, "ROOMEO_MONTHLY_PASS_INR", 299, 1, 100000), days: 30, perMember: false },
      SQUAD: { code: "SQUAD", name: "Squad pass", priceInr: int(env, "ROOMEO_SQUAD_PASS_INR", 99, 1, 100000), days: squadDays, perMember: true },
    },
    noReplyHours: int(env, "ROOMEO_NO_REPLY_HOURS", 48, 1, 720),
    boostInr: int(env, "ROOMEO_BOOST_INR", 199, 1, 100000),
    boostDays: int(env, "ROOMEO_BOOST_DAYS", 7, 1, 90),
    fastTrackInr: int(env, "ROOMEO_FAST_TRACK_INR", 149, 1, 100000),
    successFeeEnabled: flag(env, "ROOMEO_SUCCESS_FEE_ENABLED", false),
    successFeeTenantInr: int(env, "ROOMEO_SUCCESS_FEE_TENANT_INR", SUCCESS_FEE_INR, 0, 100000),
    successFeeOwnerInr: int(env, "ROOMEO_SUCCESS_FEE_OWNER_INR", SUCCESS_FEE_INR, 0, 100000),
  };
}

/** Equal share per member, rounded up to a whole rupee (UPI amounts are whole rupees here). */
export function squadShareInr(feeInr: number, members: number): number {
  if (!Number.isInteger(members) || members < 1) throw new Error("A split needs at least one member.");
  return Math.ceil(feeInr / members);
}

/** Total a squad pays to unlock: the old flat fee, or ₹99 × members under the pass model. */
export function squadFeeInr(cfg: PricingConfig, members: number): number {
  return cfg.contactModel === "PER_LISTING_FEE" ? cfg.contactFeeInr : cfg.passes.SQUAD.priceInr * Math.max(1, members);
}

/** What one squad checkout should charge. `squadMembers` is the member count (0 = solo legacy fee). */
export function contactQuote(cfg: PricingConfig, p: { squadMembers?: number; mode?: SquadPayMode }): { amountInr: number; splitParts: number } {
  const members = p.squadMembers ?? 0;
  const total = members > 0 ? squadFeeInr(cfg, members) : cfg.contactFeeInr;
  if (members > 0 && p.mode === "SPLIT") {
    if (!cfg.squadSplitEnabled) throw new Error("Splitting the fee is turned off.");
    return { amountInr: squadShareInr(total, members), splitParts: members };
  }
  return { amountInr: total, splitParts: 0 };
}

/** Squad unlocks when one full payment is confirmed, or every share of a split is confirmed. */
export function squadUnlockReady(p: { fullPaid: boolean; splitParts: number; sharesPaid: number }): boolean {
  if (p.fullPaid) return true;
  return p.splitParts > 0 && p.sharesPaid >= p.splitParts;
}

export type ContactAccess =
  | { kind: "OPEN"; source: "PASS"; passId: string }
  | { kind: "OPEN"; source: "FREE"; freeLeftAfter: number }
  | { kind: "NEED_PHONE" }
  | { kind: "NEED_PASS" }
  | { kind: "NEED_FEE" };

/**
 * How a seeker may open a new owner contact. An active pass always wins (so free contacts are
 * saved for later), then the free quota, then a pass (or the legacy fee).
 */
export function contactAccess(cfg: PricingConfig, p: { phoneVerified: boolean; freeUsed: number; activePassId: string | null }): ContactAccess {
  if (cfg.contactModel === "PER_LISTING_FEE") return { kind: "NEED_FEE" };
  if (p.activePassId) return { kind: "OPEN", source: "PASS", passId: p.activePassId };
  const left = Math.max(0, cfg.freeContacts - p.freeUsed);
  if (left > 0) return p.phoneVerified ? { kind: "OPEN", source: "FREE", freeLeftAfter: left - 1 } : { kind: "NEED_PHONE" };
  return { kind: "NEED_PASS" };
}

export const FAILED_OUTCOMES = ["DECLINED", "NO_REPLY"] as const;

/**
 * Refund promise: a pass is refunded when at least one contact was made under it and every one
 * of those contacts was declined by the owner or got no owner reply within the no reply window.
 * A pass with no contacts, or any contact the owner answered, is not refunded.
 */
export function passRefundDue(outcomes: (string | null)[]): boolean {
  if (outcomes.length === 0) return false;
  return outcomes.every((o) => o === "DECLINED" || o === "NO_REPLY");
}

/** A pass can be settled once its last possible contact has had the full no reply window. */
export function passSettleable(endsAt: Date, now: Date, noReplyHours: number): boolean {
  return now.getTime() >= endsAt.getTime() + noReplyHours * 3600_000;
}

/** New pass starts when the current one ends (stacking), else now. */
export function passWindow(now: Date, currentEnd: Date | null, days: number): { start: Date; end: Date } {
  const start = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  return { start, end: new Date(start.getTime() + days * 86400_000) };
}

export function boostedUntil(now: Date, current: Date | null, days: number): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * 86400_000);
}

/** Move in is confirmed only when both the tenant and the owner clicked. */
export function moveInConfirmed(p: { seekerAt: unknown; ownerAt: unknown }): boolean {
  return Boolean(p.seekerAt) && Boolean(p.ownerAt);
}

/** Squad move in: every current member and the owner have confirmed. */
export function squadMoveInConfirmed(p: { memberIds: string[]; confirmedIds: string[]; ownerConfirmed: boolean }): boolean {
  if (!p.ownerConfirmed || p.memberIds.length === 0) return false;
  const done = new Set(p.confirmedIds);
  return p.memberIds.every((id) => done.has(id));
}

/** Each squad member's share of the tenant success fee, rounded up to a whole rupee. */
export function squadSuccessShareInr(tenantFeeInr: number, members: number): number {
  return Math.ceil(tenantFeeInr / Math.max(1, members));
}

export const REFUND_PROMISE =
  "If every owner you contact with a pass declines or does not reply within 48 hours, the full pass price goes back to your UPI ID.";

/** One-time success fee per side per deal (Rohith, 2026-10-29). */
export const SUCCESS_FEE_INR = 999;

/** Shown before anyone confirms or pays, so nobody is surprised. */
export function successFeeHeadsUp(feeInr: number, role: "tenant" | "owner"): string {
  return role === "tenant"
    ? `Heads up: once you and the owner both confirm the move in, there's a one-time ₹${feeInr} success fee. That's it, no cut of your rent, ever.`
    : `Heads up: once you and the tenant both confirm the move in, there's a one-time ₹${feeInr} success fee for you too. One time, no cut of the rent.`;
}

/** A fee payment counts for this deal only if it was made after this deal was confirmed. */
export function feeBelongsToDeal(paymentCreatedAt: string | null | undefined, dealConfirmedAt: string | null | undefined): boolean {
  if (!paymentCreatedAt || !dealConfirmedAt) return false;
  return Date.parse(paymentCreatedAt) >= Date.parse(dealConfirmedAt);
}
