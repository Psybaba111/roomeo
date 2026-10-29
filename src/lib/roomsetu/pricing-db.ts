// Database side of pricing v2: contact grants, passes, host extras, move ins and the daily sweep.
import type { Sql } from "@/lib/db";
import { num, str } from "@/lib/roomsetu/map";
import { boostedUntil, contactAccess, passRefundDue, passWindow, pricingConfig, type PassCode } from "@/lib/roomsetu/pricing";

async function notify(sql: Sql, userId: string, title: string, body: string, href: string) {
  await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${userId}, 'payment', ${title}, ${body}, ${href})`;
}

export async function activePass(sql: Sql, userId: string) {
  const r = await sql<{ id: string; code: string; ends_at: string }>`select id, code, ends_at::text as ends_at from contact_passes
    where user_id = ${userId} and status = 'ACTIVE' and starts_at <= now() and ends_at > now() order by ends_at desc limit 1`;
  return r[0] ?? null;
}
export async function latestPassEnd(sql: Sql, userId: string): Promise<Date | null> {
  const r = await sql<{ e: string | null }>`select max(ends_at)::text as e from contact_passes where user_id = ${userId} and status = 'ACTIVE'`;
  return r[0]?.e ? new Date(r[0].e) : null;
}
export async function squadActivePass(sql: Sql, squadId: string) {
  const r = await sql<{ id: string; ends_at: string }>`select id, ends_at::text as ends_at from contact_passes
    where squad_id = ${squadId} and status = 'ACTIVE' and ends_at > now() order by ends_at desc limit 1`;
  return r[0] ?? null;
}
export async function freeUsed(sql: Sql, userId: string): Promise<number> {
  const r = await sql<{ n: number }>`select count(*)::int as n from contact_unlocks where (seeker_id = ${userId} or charged_user_id = ${userId}) and source = 'FREE' and restored_at is null`;
  return num(r[0]?.n);
}
async function phoneVerified(sql: Sql, userId: string) {
  const r = await sql<{ ok: boolean }>`select phone_verified_at is not null as ok from profiles where user_id = ${userId}`;
  return Boolean(r[0]?.ok);
}

export async function contactSummary(sql: Sql, userId: string) {
  const cfg = pricingConfig();
  const [used, pass, phone] = await Promise.all([freeUsed(sql, userId), activePass(sql, userId), phoneVerified(sql, userId)]);
  return {
    model: cfg.contactModel,
    freeTotal: cfg.freeContacts,
    freeLeft: Math.max(0, cfg.freeContacts - used),
    phoneVerified: phone,
    pass: pass ? { code: str(pass.code), endsAt: str(pass.ends_at) } : null,
    access: contactAccess(cfg, { phoneVerified: phone, freeUsed: used, activePassId: pass?.id ?? null }).kind,
  };
}

/**
 * Pass model: let a seeker open a new owner contact, recording whether it used the pass or a free
 * contact. Throws with a clear next step when neither is available.
 */
export async function grantContact(sql: Sql, listingId: string, seekerId: string) {
  const cfg = pricingConfig();
  const pass = await activePass(sql, seekerId);
  const access = contactAccess(cfg, { phoneVerified: await phoneVerified(sql, seekerId), freeUsed: await freeUsed(sql, seekerId), activePassId: pass?.id ?? null });
  if (access.kind === "NEED_PHONE") throw new Error("Verify your phone number to use your free owner contacts.");
  if (access.kind === "NEED_PASS")
    throw new Error(`You have used your ${cfg.freeContacts} free contacts. Get a weekly pass for ₹${cfg.passes.WEEKLY.priceInr} to keep messaging owners.`);
  if (access.kind !== "OPEN") throw new Error("Contact is locked.");
  await sql`insert into contact_unlocks (id, listing_id, seeker_id, source, pass_id)
    values (${crypto.randomUUID()}, ${listingId}, ${seekerId}, ${access.source}, ${access.source === "PASS" ? access.passId : null})
    on conflict do nothing`;
  return access;
}

/** Owner declined a seeker or squad: record the outcome and hand back a free contact. */
export async function recordDecline(sql: Sql, p: { listingId: string; seekerId?: string; squadId?: string }) {
  const rows = p.squadId
    ? await sql<{ id: string; source: string; seeker_id: string | null }>`update contact_unlocks set outcome = 'DECLINED', outcome_at = now(),
        restored_at = case when source = 'FREE' then now() else restored_at end
        where listing_id = ${p.listingId} and squad_id = ${p.squadId} and source in ('FREE','PASS') and (outcome is null or outcome = 'REPLIED') returning id, source, coalesce(seeker_id, charged_user_id) as seeker_id`
    : await sql<{ id: string; source: string; seeker_id: string | null }>`update contact_unlocks set outcome = 'DECLINED', outcome_at = now(),
        restored_at = case when source = 'FREE' then now() else restored_at end
        where listing_id = ${p.listingId} and seeker_id = ${p.seekerId ?? ""} and squad_id is null and source in ('FREE','PASS') and (outcome is null or outcome = 'REPLIED') returning id, source, seeker_id`;
  for (const r of rows) {
    if (r.source === "FREE" && r.seeker_id)
      await notify(sql, r.seeker_id, "Free contact is back", "The owner declined, so we gave your free contact back. Use it on another room.", "/pricing");
  }
  return rows;
}

/** Create or extend a pass after its payment is confirmed. */
async function startPass(sql: Sql, paymentId: string, userId: string, code: PassCode) {
  const cfg = pricingConfig();
  const plan = cfg.passes[code];
  const { start, end } = passWindow(new Date(), await latestPassEnd(sql, userId), plan.days);
  await sql`insert into contact_passes (id, user_id, code, payment_id, starts_at, ends_at)
    values (${crypto.randomUUID()}, ${userId}, ${code}, ${paymentId}, ${start.toISOString()}, ${end.toISOString()})`;
  await notify(sql, userId, `${plan.name} is active`, `Message as many owners as you like until ${end.toISOString().slice(0, 10)}.`, "/pricing");
}

/** Squad pass: called once every share (or the full amount) is confirmed. */
export async function startSquadPass(sql: Sql, squadId: string, listingId: string, paymentId: string): Promise<string> {
  const cfg = pricingConfig();
  const existing = await squadActivePass(sql, squadId);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const end = new Date(Date.now() + cfg.passes.SQUAD.days * 86400_000);
  await sql`insert into contact_passes (id, squad_id, code, payment_id, listing_id, ends_at) values (${id}, ${squadId}, 'SQUAD', ${paymentId}, ${listingId}, ${end.toISOString()})`;
  return id;
}

/** Runs after an admin approves any UPI payment. Handles the pricing v2 payment kinds. */
export async function applyPaidPayment(sql: Sql, paymentId: string) {
  const rows = await sql<{ user_id: string; kind: string; pass_code: string | null; listing_id: string | null }>`
    select user_id, kind, pass_code, listing_id from payments where id = ${paymentId} and status = 'PAID'`;
  const p = rows[0];
  if (!p) return;
  const cfg = pricingConfig();
  if (p.kind === "PASS" && (p.pass_code === "WEEKLY" || p.pass_code === "MONTHLY")) {
    const already = await sql`select 1 from contact_passes where payment_id = ${paymentId}`;
    if (!already.length) await startPass(sql, paymentId, p.user_id, p.pass_code);
  } else if (p.kind === "BOOST" && p.listing_id) {
    const cur = await sql<{ b: string | null }>`select boosted_until::text as b from listings where id = ${p.listing_id}`;
    const until = boostedUntil(new Date(), cur[0]?.b ? new Date(cur[0].b) : null, cfg.boostDays);
    await sql`update listings set boosted_until = ${until.toISOString()} where id = ${p.listing_id}`;
    await notify(sql, p.user_id, "Boost is live", `Your listing shows first in search until ${until.toISOString().slice(0, 10)}.`, "/dashboard");
  } else if (p.kind === "FASTTRACK") {
    await sql`update profiles set fast_track_at = coalesce(fast_track_at, now()) where user_id = ${p.user_id}`;
    await notify(sql, p.user_id, "Fast track is on", "Your ID review moved to the front of the queue.", "/verification");
  } else if (p.kind === "SUCCESS_FEE") {
    const { createFeeInvoice } = await import("@/lib/roomsetu/agreement-db");
    const amt = await sql<{ amount_inr: number }>`select amount_inr from payments where id = ${paymentId}`;
    const inv = await createFeeInvoice(sql, paymentId, Math.round(Number(amt[0]?.amount_inr ?? 0) / 1.18));
    await notify(sql, p.user_id, "Success fee paid ✅", inv ? `Thanks! Your GST invoice ${String(inv.number)} is ready.` : "Thanks. You're all set.", inv ? `/invoice/${paymentId}` : "/applications");
  }
}

/**
 * Daily sweep (Vercel cron, and a button in admin):
 * 1. contacts the owner answered become REPLIED;
 * 2. contacts with no owner reply after the window become NO_REPLY (free contacts come back);
 * 3. passes whose window is over are settled: refund due if every contact failed, else settled.
 */
export async function runPricingSweep(sql: Sql) {
  const cfg = pricingConfig();
  const replied = await sql.query<{ id: string }>(
    `update contact_unlocks u set outcome = 'REPLIED', outcome_at = now()
     from listings l where l.id = u.listing_id and u.outcome is null and u.source in ('FREE','PASS') and (
       exists (select 1 from messages m join conversations c on c.id = m.conversation_id
               where c.listing_id = u.listing_id and m.sender_id = l.owner_id and m.kind <> 'SYSTEM'
                 and m.created_at <= u.created_at + make_interval(hours => $1)
                 and ((u.squad_id is not null and c.squad_id = u.squad_id)
                   or (u.squad_id is null and c.squad_id is null and exists (select 1 from conversation_members cm where cm.conversation_id = c.id and cm.user_id = u.seeker_id))))
       or (u.seeker_id is not null and exists (select 1 from applications a where a.listing_id = u.listing_id and a.seeker_id = u.seeker_id and a.status = 'ACCEPTED'))
       or (u.squad_id is not null and exists (select 1 from squad_requests r where r.listing_id = u.listing_id and r.squad_id = u.squad_id and r.status in ('ACCEPTED','VISIT_PROPOSED'))))
     returning u.id`,
    [cfg.noReplyHours],
  );
  const noReply = await sql.query<{ id: string; source: string; seeker_id: string | null }>(
    `update contact_unlocks set outcome = 'NO_REPLY', outcome_at = now(),
       restored_at = case when source = 'FREE' then now() else restored_at end
     where outcome is null and source in ('FREE','PASS') and created_at <= now() - make_interval(hours => $1)
     returning id, source, coalesce(seeker_id, charged_user_id) as seeker_id`,
    [cfg.noReplyHours],
  );
  for (const r of noReply) {
    if (r.source === "FREE" && r.seeker_id)
      await notify(sql, r.seeker_id, "Free contact is back", `The owner did not reply within ${cfg.noReplyHours} hours, so your free contact is back.`, "/pricing");
  }
  const due = await sql.query<{ id: string; user_id: string | null; squad_id: string | null; payment_id: string | null; listing_id: string | null; code: string }>(
    `select id, user_id, squad_id, payment_id, listing_id, code from contact_passes
     where status = 'ACTIVE' and ends_at + make_interval(hours => $1) <= now()`,
    [cfg.noReplyHours],
  );
  let refunds = 0;
  for (const pass of due) {
    const outs = await sql<{ outcome: string | null }>`select outcome from contact_unlocks where pass_id = ${pass.id}`;
    const refund = passRefundDue(outs.map((o) => o.outcome));
    if (refund) {
      const reason = "Pass refund promise: every owner contacted declined or did not reply.";
      const paid = pass.squad_id
        ? await sql<{ user_id: string }>`update payments set status = 'REFUND_DUE', refund_due_at = now(), refund_reason = ${reason}
            where kind = 'CONTACT' and pass_code = 'SQUAD' and status = 'PAID' and squad_id = ${pass.squad_id} and listing_id = ${pass.listing_id ?? ""} returning user_id`
        : await sql<{ user_id: string }>`update payments set status = 'REFUND_DUE', refund_due_at = now(), refund_reason = ${reason}
            where id = ${pass.payment_id ?? ""} and status = 'PAID' returning user_id`;
      for (const u of paid) await notify(sql, u.user_id, "Pass refund on the way", "No owner replied or every owner declined, so your pass is being refunded to your UPI ID.", "/pricing");
      refunds += paid.length;
    }
    await sql`update contact_passes set status = ${refund ? "REFUND_DUE" : "SETTLED"}, settled_at = now() where id = ${pass.id}`;
  }
  return { replied: replied.length, noReply: noReply.length, passesSettled: due.length, refunds };
}

/**
 * Unlock a squad's chat with an owner using one member's free chat or that member's active
 * personal pass (instead of a squad pass). The member is recorded as charged_user_id.
 */
export async function grantSquadContactFromMember(sql: Sql, p: { squadId: string; listingId: string; userId: string; use: "FREE" | "PASS" }) {
  const cfg = pricingConfig();
  if (cfg.contactModel !== "FREE_THEN_PASS") throw new Error("Use the squad contact fee.");
  if (p.use === "PASS") {
    const pass = await activePass(sql, p.userId);
    if (!pass) throw new Error("You do not have an active pass.");
    await sql`insert into contact_unlocks (id, listing_id, squad_id, source, pass_id, charged_user_id)
      values (${crypto.randomUUID()}, ${p.listingId}, ${p.squadId}, 'PASS', ${pass.id}, ${p.userId}) on conflict do nothing`;
    return;
  }
  if (!(await phoneVerified(sql, p.userId))) throw new Error("Verify your phone number to use your free chats.");
  if ((await freeUsed(sql, p.userId)) >= cfg.freeContacts) throw new Error("You have no free chats left. Use a pass or the squad pass.");
  await sql`insert into contact_unlocks (id, listing_id, squad_id, source, charged_user_id)
    values (${crypto.randomUUID()}, ${p.listingId}, ${p.squadId}, 'FREE', ${p.userId}) on conflict do nothing`;
}
