/** Bring a roommate, both save ₹500. Pure rules; DB work lives in referral-api.ts. */
type Env = Record<string, string | undefined>;
const procEnv = (): Env => (typeof process !== "undefined" ? (process.env as Env) : {});

export const REFERRAL_CREDIT_INR = 500;
/** A referral only sticks to a fresh account, so nobody back-dates a friend who already signed up. */
export const CLAIM_WINDOW_DAYS = 14;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I mix-ups when read aloud

/** OFF unless ROOMEO_REFERRALS_ENABLED is true/1/on/yes. Needs migration 0017 on the database first. */
export function referralsEnabled(env: Env = procEnv()): boolean {
  const v = env.ROOMEO_REFERRALS_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

export function makeReferralCode(rand: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  let s = "";
  for (let i = 0; i < 7; i++) s += ALPHABET[rand(ALPHABET.length)];
  return s;
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{7}$/.test(c) ? c : null;
}

export function referralLink(base: string, code: string): string {
  return `${base.replace(/\/+$/, "")}/r/${code}`;
}

export function referralShareText(link: string): string {
  return `Found my PG on roomeo, zero broker fees 🙌 Sign up with my link and we both get ₹${REFERRAL_CREDIT_INR} off our first month: ${link}`;
}

export type ClaimCheck =
  | { ok: true }
  | { ok: false; reason: "SELF" | "ALREADY_REFERRED" | "TOO_LATE" | "ALREADY_MOVED_IN" | "UNKNOWN_CODE" };

export function canClaim(p: {
  refereeId: string;
  referrerId: string | null;
  alreadyReferred: boolean;
  accountCreatedAt: Date;
  hasMovedIn: boolean;
  now?: Date;
}): ClaimCheck {
  if (!p.referrerId) return { ok: false, reason: "UNKNOWN_CODE" };
  if (p.referrerId === p.refereeId) return { ok: false, reason: "SELF" };
  if (p.alreadyReferred) return { ok: false, reason: "ALREADY_REFERRED" };
  if (p.hasMovedIn) return { ok: false, reason: "ALREADY_MOVED_IN" };
  const age = (p.now ?? new Date()).getTime() - p.accountCreatedAt.getTime();
  if (age > CLAIM_WINDOW_DAYS * 86_400_000) return { ok: false, reason: "TOO_LATE" };
  return { ok: true };
}

export const CLAIM_MESSAGES: Record<Exclude<ClaimCheck, { ok: true }>["reason"], string> = {
  SELF: "Nice try 😅 you can't refer yourself.",
  ALREADY_REFERRED: "You're already linked to a friend's invite.",
  TOO_LATE: "Invite links only work in your first 14 days on roomeo.",
  ALREADY_MOVED_IN: "Invites count before your first move-in.",
  UNKNOWN_CODE: "That invite code doesn't exist.",
};

/** The two ₹500 credits a completed referral creates, one each. */
export function completionCredits(r: { id: string; referrerId: string; refereeId: string }) {
  return [
    { userId: r.refereeId, referralId: r.id, amountInr: REFERRAL_CREDIT_INR, reason: "Joined with a friend's invite" },
    { userId: r.referrerId, referralId: r.id, amountInr: REFERRAL_CREDIT_INR, reason: "Your friend moved in" },
  ];
}

/** True when the error is "table does not exist" (migration 0017 not applied yet). */
export function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "42P01" || /relation .* does not exist/i.test(String(e?.message ?? ""));
}
