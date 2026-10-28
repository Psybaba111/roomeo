// Single place for how seekers pay to contact owners. Today: a one-time fee per listing
// (ROOMEO_CONTACT_FEE, default 499), with squads paying in full or in equal shares.
// Future models (free contact quota, time passes, refundable deposit) plug in here by adding a
// ContactModel and branching in contactQuote(); callers only ask "what does this contact cost?".
import { contactFeeInr } from "./contact.ts";

export type ContactModel = "PER_LISTING_FEE";
export type SquadPayMode = "FULL" | "SPLIT";

export type PricingConfig = {
  contactModel: ContactModel;
  contactFeeInr: number;
  squadSplitEnabled: boolean;
};

export function pricingConfig(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): PricingConfig {
  return {
    contactModel: "PER_LISTING_FEE",
    contactFeeInr: contactFeeInr(env),
    squadSplitEnabled: env.ROOMEO_SQUAD_SPLIT?.trim().toLowerCase() !== "false",
  };
}

/** Equal share per member, rounded up to a whole rupee (UPI amounts are whole rupees here). */
export function squadShareInr(feeInr: number, members: number): number {
  if (!Number.isInteger(members) || members < 1) throw new Error("A split needs at least one member.");
  return Math.ceil(feeInr / members);
}

/** What one checkout should charge. */
export function contactQuote(cfg: PricingConfig, p: { squadMembers?: number; mode?: SquadPayMode }): { amountInr: number; splitParts: number } {
  if (p.squadMembers && p.mode === "SPLIT") {
    if (!cfg.squadSplitEnabled) throw new Error("Splitting the fee is turned off.");
    return { amountInr: squadShareInr(cfg.contactFeeInr, p.squadMembers), splitParts: p.squadMembers };
  }
  return { amountInr: cfg.contactFeeInr, splitParts: 0 };
}

/** Squad unlocks when one full payment is confirmed, or every share of a split is confirmed. */
export function squadUnlockReady(p: { fullPaid: boolean; splitParts: number; sharesPaid: number }): boolean {
  if (p.fullPaid) return true;
  return p.splitParts > 0 && p.sharesPaid >= p.splitParts;
}
