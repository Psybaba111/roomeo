// One path for "this move-in is confirmed", shared by the in-app two-click confirm and the
// signed move-in agreement. Pure SQL with relative imports so it runs under node tests.
import type { Sql } from "../db.ts";
import { moveInConfirmed } from "./pricing.ts";
import { completionCredits, isMissingTable, referralsEnabled } from "./referrals.ts";

/**
 * Called once a move-in is confirmed. If the renter came in on an invite and this is their
 * first completed move-in, both people get ₹500 credit. Never throws: a referral hiccup must not break the move-in.
 */
export async function completeReferralOnMoveIn(sql: Sql, seekerId: string, applicationId: string): Promise<boolean> {
  if (!referralsEnabled()) return false;
  try {
    const done = await sql<{ id: string; referrer_id: string }>`update referrals set completed_at = now(), application_id = ${applicationId}
      where referee_id = ${seekerId} and completed_at is null returning id, referrer_id`;
    const r = done[0];
    if (!r) return false;
    for (const c of completionCredits({ id: r.id, referrerId: r.referrer_id, refereeId: seekerId })) {
      await sql`insert into referral_credits (id, user_id, referral_id, amount_inr, reason) values (${crypto.randomUUID()}, ${c.userId}, ${c.referralId}, ${c.amountInr}, ${c.reason}) on conflict (user_id, referral_id) do nothing`;
      await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${c.userId}, 'application', ${`₹${c.amountInr} off your first month`}, ${c.reason + ". Show this at move-in, we'll knock it off the rent."}, '/dashboard')`;
    }
    return true;
  } catch (err) {
    console.error("[referrals] completion skipped", isMissingTable(err) ? "(migration 0017 not applied)" : err);
    return false;
  }
}

export const signedKey = (inviteId: string) => `movein:${inviteId}`;

/**
 * Mark one side (or both, for a signed agreement) as confirmed on the move_ins row for this deal and,
 * the first time both sides are in, stamp confirmed_at, notify and run the referral credit.
 * Idempotent: re-running never re-stamps, re-notifies or re-credits.
 * A tenant+listing pair has at most one move_ins row: a row created by signing (key movein:<invite>)
 * is adopted by the request when the old in-app confirm runs later, and vice versa.
 */
export async function confirmMoveInRecord(
  sql: Sql,
  d: { applicationId: string; listingId: string; seekerId: string; ownerId: string; side: "seeker" | "owner" | "both"; notifyUserId: string | null; notifyBody?: string },
): Promise<{ confirmed: boolean; newlyConfirmed: boolean; moveInId: string }> {
  const existing = (await sql<{ id: string; application_id: string | null }>`select id, application_id from move_ins
    where (application_id = ${d.applicationId}) or (seeker_id = ${d.seekerId} and listing_id = ${d.listingId}) order by (application_id = ${d.applicationId}) desc, confirmed_at nulls last limit 1`)[0];
  let id = existing?.id;
  if (!id) {
    id = crypto.randomUUID();
    await sql`insert into move_ins (id, application_id, listing_id, seeker_id, owner_id) values (${id}, ${d.applicationId}, ${d.listingId}, ${d.seekerId}, ${d.ownerId}) on conflict (application_id) do nothing`;
    id = (await sql<{ id: string }>`select id from move_ins where application_id = ${d.applicationId}`)[0].id;
  } else if (existing.application_id?.startsWith("movein:") && !d.applicationId.startsWith("movein:")) {
    // A real request now exists for a signed move-in: point the row at it so request screens see it.
    await sql`update move_ins set application_id = ${d.applicationId} where id = ${id} and not exists (select 1 from move_ins where application_id = ${d.applicationId})`;
  }
  if (d.side !== "owner") await sql`update move_ins set seeker_confirmed_at = coalesce(seeker_confirmed_at, now()) where id = ${id}`;
  if (d.side !== "seeker") await sql`update move_ins set owner_confirmed_at = coalesce(owner_confirmed_at, now()) where id = ${id}`;
  const m = (await sql<{ s: string | null; o: string | null; application_id: string }>`select seeker_confirmed_at::text as s, owner_confirmed_at::text as o, application_id from move_ins where id = ${id}`)[0];
  const both = moveInConfirmed({ seekerAt: m?.s, ownerAt: m?.o });
  if (!both) return { confirmed: false, newlyConfirmed: false, moveInId: id };
  const stamped = await sql<{ id: string }>`update move_ins set confirmed_at = now() where id = ${id} and confirmed_at is null returning id`;
  if (stamped.length === 0) return { confirmed: true, newlyConfirmed: false, moveInId: id };
  if (d.notifyUserId)
    await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${d.notifyUserId}, 'application', 'Move in confirmed', ${d.notifyBody ?? "Both of you confirmed the move in. Welcome home."}, '/applications')`;
  await completeReferralOnMoveIn(sql, d.seekerId, m.application_id);
  return { confirmed: true, newlyConfirmed: true, moveInId: id };
}
