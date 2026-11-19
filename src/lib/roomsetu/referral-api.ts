import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { SITE_URL } from "@/lib/seo";
import {
  CLAIM_MESSAGES,
  canClaim,
  isMissingTable,
  makeReferralCode,
  normalizeCode,
  referralLink,
  referralShareText,
  referralsEnabled,
  REFERRAL_CREDIT_INR,
} from "@/lib/roomsetu/referrals";
import { feeCreditConfig } from "@/lib/roomsetu/fee-credits";

/** Fee credits on: the new credit promise. Off (prod today): the old ₹500 messages, word for word. */
function linkedMessage(already: boolean): string {
  const fc = feeCreditConfig();
  if (fc.enabled) return `You're linked 🎉 Once you move in and pay your first month, Roomeo adds ₹${fc.amountInr} credit for you both, off your next Roomeo fee.`;
  return already ? "You're linked. ₹500 off lands when you move in 🎉" : "You're linked. ₹500 off your first month when you move in 🎉";
}

async function ensureCode(sql: Sql, userId: string): Promise<string> {
  const have = await sql<{ code: string }>`select code from referral_codes where user_id = ${userId}`;
  if (have[0]) return have[0].code;
  for (let i = 0; i < 5; i++) {
    const code = makeReferralCode();
    await sql`insert into referral_codes (user_id, code) values (${userId}, ${code}) on conflict do nothing`;
    const again = await sql<{ code: string }>`select code from referral_codes where user_id = ${userId}`;
    if (again[0]) return again[0].code;
  }
  throw new Error("Could not make your invite code. Try again.");
}

/** Your invite card. `enabled: false` hides the card (flag off, or migration 0017 not on this database yet). */
export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const off = { enabled: false as const };
    if (!referralsEnabled()) return off;
    try {
      const sql = await getSql();
      const code = await ensureCode(sql, context.userId);
      const link = referralLink(SITE_URL, code);
      const stats = (await sql<{ joined: number; moved: number }>`select count(*)::int as joined, count(completed_at)::int as moved from referrals where referrer_id = ${context.userId}`)[0];
      const credit = (await sql<{ total: number }>`select coalesce(sum(amount_inr), 0)::int as total from referral_credits where user_id = ${context.userId} and status = 'AVAILABLE'`)[0];
      const fc = feeCreditConfig();
      if (fc.enabled) {
        const { creditBalance } = await import("@/lib/roomsetu/fee-credits-db");
        return {
          enabled: true as const,
          mode: "fee" as const,
          code,
          link,
          shareText: `Found my PG on roomeo, zero broker fees 🙌 Sign up with my link. When you move in and pay your first month, we each get ₹${fc.amountInr} off our next Roomeo fee: ${link}`,
          perPerson: fc.amountInr,
          joined: Number(stats?.joined ?? 0),
          movedIn: Number(stats?.moved ?? 0),
          creditInr: await creditBalance(sql, context.userId),
        };
      }
      // Fee credits off (prod today): the old ₹500-off-first-month reward, unchanged (Rohith, 19 Nov 2026).
      return {
        mode: "legacy" as const,
        enabled: true as const,
        code,
        link,
        shareText: referralShareText(link),
        perPerson: REFERRAL_CREDIT_INR,
        joined: Number(stats?.joined ?? 0),
        movedIn: Number(stats?.moved ?? 0),
        creditInr: Number(credit?.total ?? 0),
      };
    } catch (err) {
      if (isMissingTable(err)) return off;
      throw err;
    }
  });

/** Link the signed-in renter to a friend's invite code. Safe to call more than once. */
export const claimReferral = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ code: normalizeCode((input as { code?: unknown } | null)?.code) }))
  .handler(async ({ context, data }) => {
    if (!referralsEnabled()) return { ok: false, message: "Invites aren't live yet." };
    if (!data.code) return { ok: false, message: CLAIM_MESSAGES.UNKNOWN_CODE };
    try {
      const sql = await getSql();
      const owner = (await sql<{ user_id: string }>`select user_id from referral_codes where code = ${data.code}`)[0];
      const existing = (await sql<{ referrer_id: string }>`select referrer_id from referrals where referee_id = ${context.userId}`)[0];
      if (existing && owner && existing.referrer_id === owner.user_id) return { ok: true, message: linkedMessage(true) };
      const u = (await sql<{ created: string }>`select "createdAt"::text as created from "user" where id = ${context.userId}`)[0];
      const moved = (await sql<{ n: number }>`select count(*)::int as n from move_ins where seeker_id = ${context.userId} and confirmed_at is not null`)[0];
      const check = canClaim({
        refereeId: context.userId,
        referrerId: owner?.user_id ?? null,
        alreadyReferred: Boolean(existing),
        accountCreatedAt: u ? new Date(u.created) : new Date(0),
        hasMovedIn: Number(moved?.n ?? 0) > 0,
      });
      if (!check.ok) return { ok: false, message: CLAIM_MESSAGES[check.reason] };
      await sql`insert into referrals (id, referrer_id, referee_id, code) values (${crypto.randomUUID()}, ${owner!.user_id}, ${context.userId}, ${data.code}) on conflict (referee_id) do nothing`;
      return { ok: true, message: linkedMessage(false) };
    } catch (err) {
      if (isMissingTable(err)) return { ok: false, message: "Invites aren't live yet." };
      throw err;
    }
  });

export { completeReferralOnMoveIn } from "@/lib/roomsetu/movein-confirm";

/** Public: is this a real, live invite? The /r/CODE page only shows the ₹ offer when the program is on and the code exists. */
export const getInviteStatus = createServerFn({ method: "GET" })
  .validator((i: unknown) => (typeof i === "string" ? i : ""))
  .handler(async ({ data }) => {
    const code = normalizeCode(data);
    if (!referralsEnabled() || !code) return { live: false as const };
    try {
      const sql = await getSql();
      const r = await sql<{ code: string }>`select code from referral_codes where code = ${code}`;
      // Fee credits on: the admin-issued fee credit. Off (prod today): the old ₹500 off the first month.
      const fc = feeCreditConfig();
      return r[0] ? { live: true as const, mode: fc.enabled ? ("fee" as const) : ("legacy" as const), perPerson: fc.enabled ? fc.amountInr : REFERRAL_CREDIT_INR } : { live: false as const };
    } catch (e) {
      if (isMissingTable(e)) return { live: false as const };
      throw e;
    }
  });
