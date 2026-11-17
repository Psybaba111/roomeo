/**
 * Referral fee credits (Rohith, 17 Nov 2026). Pure rules; SQL lives in fee-credits-db.ts.
 *
 * - A credit is ₹499 (ROOMEO_REFERRAL_CREDIT_INR) off the holder's NEXT Roomeo fee: the tenant's ₹499 platform
 *   fee or the owner's ₹499 fee. Never cash, never paid out, not transferable.
 * - Issued by hand by an admin, one per person per referral pair (referrer + friend), after the friend has moved
 *   in and paid their first month. Programme capped at ROOMEO_REFERRAL_CREDIT_PAIRS_CAP pairs (default 4 = 8
 *   credits). Kill switch: ROOMEO_REFERRAL_CREDITS_ENABLED (default OFF). Off = no new credits and nothing is
 *   applied; balances already issued stay in the ledger untouched.
 * - Applied automatically, oldest first, when the holder's next fee is created. If the fee is smaller than the
 *   credit, only the fee amount is used and the rest stays as balance.
 * - GST (CA to confirm): the credit is treated as a discount given at the time of supply, the same way as the
 *   ₹99 trial credit. The invoice is on what was actually paid, GST carved out of that (₹499 − ₹200 credit = ₹299
 *   paid → ₹253.39 + ₹45.61 GST). A fee fully covered by credit has ₹0 consideration: no invoice is issued.
 * - If the fee it was used on is voided or refunded (deposit mark undone, stay cancelled within 7 days, owner's
 *   50% early-exit rule), the credit used is restored, never paid out.
 */
type Env = Record<string, string | undefined>;
const procEnv = (): Env => (typeof process !== "undefined" ? (process.env as Env) : {});

export const FEE_CREDIT_INR = 499;
export const FEE_CREDIT_PAIRS_CAP = 4;
export type CreditStatus = "issued" | "applied" | "void";
export type FeeKind = "tenant_fee" | "owner_fee";

function flag(env: Env, k: string): boolean {
  const v = env[k]?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}
function int(env: Env, k: string, def: number, min: number, max: number): number {
  const raw = env[k]?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
}

export type FeeCreditConfig = { enabled: boolean; amountInr: number; pairsCap: number };
export function feeCreditConfig(env: Env = procEnv()): FeeCreditConfig {
  return {
    enabled: flag(env, "ROOMEO_REFERRAL_CREDITS_ENABLED"),
    amountInr: int(env, "ROOMEO_REFERRAL_CREDIT_INR", FEE_CREDIT_INR, 1, 100000),
    pairsCap: int(env, "ROOMEO_REFERRAL_CREDIT_PAIRS_CAP", FEE_CREDIT_PAIRS_CAP, 0, 1000),
  };
}

export type OpenCredit = { id: string; remainingInr: number; createdAt: string };

/** Split a fee across open credits, oldest first. Never more than the fee; never more than a credit has left. */
export function allocateCredits(feeInr: number, credits: OpenCredit[]): { creditId: string; amountInr: number }[] {
  let left = Math.max(0, Math.floor(feeInr));
  const out: { creditId: string; amountInr: number }[] = [];
  for (const c of [...credits].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    if (left <= 0) break;
    const use = Math.min(left, Math.max(0, Math.floor(c.remainingInr)));
    if (use <= 0) continue;
    out.push({ creditId: c.id, amountInr: use });
    left -= use;
  }
  return out;
}

/** Status from what's left: nothing left → applied; otherwise issued (void is set by an admin only). */
export function statusFor(amountInr: number, usedInr: number): Exclude<CreditStatus, "void"> {
  return usedInr >= amountInr ? "applied" : "issued";
}

/** Restore order when a fee shrinks: undo the newest applications first. */
export function restorePlan(applied: { creditId: string; netInr: number; at: string }[], restoreInr: number): { creditId: string; amountInr: number }[] {
  let left = Math.max(0, Math.floor(restoreInr));
  const out: { creditId: string; amountInr: number }[] = [];
  for (const a of [...applied].sort((x, y) => y.at.localeCompare(x.at))) {
    if (left <= 0) break;
    const back = Math.min(left, a.netInr);
    if (back <= 0) continue;
    out.push({ creditId: a.creditId, amountInr: back });
    left -= back;
  }
  return out;
}

export function creditBalanceLine(balanceInr: number): string {
  return balanceInr > 0
    ? `₹${balanceInr} Roomeo credit. It comes off your next Roomeo fee automatically. It isn't cash and can't be paid out.`
    : "No Roomeo credit right now.";
}

export const CREDIT_GST_NOTE =
  "GST (CA to confirm): a credit is a discount at the time of supply, like the ₹99 trial credit. The invoice is on the amount actually paid; a fee fully covered by credit has no invoice.";
