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
      return {
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
      if (existing && owner && existing.referrer_id === owner.user_id) return { ok: true, message: "You're linked. ₹500 off lands when you move in 🎉" };
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
      return { ok: true, message: "You're linked. ₹500 off your first month when you move in 🎉" };
    } catch (err) {
      if (isMissingTable(err)) return { ok: false, message: "Invites aren't live yet." };
      throw err;
    }
  });

export { completeReferralOnMoveIn } from "@/lib/roomsetu/movein-confirm";
