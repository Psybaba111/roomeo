import { feeWithGst } from "@/lib/roomsetu/deal-agreement";
import { contactQuote, pricingConfig, squadFeeInr, squadUnlockReady, type SquadPayMode } from "@/lib/roomsetu/pricing";
import { contactSummary, grantContact, grantSquadContactFromMember, recordDecline, squadActivePass, startSquadPass } from "@/lib/roomsetu/pricing-db";
import { squadMoveInConfirmed } from "@/lib/roomsetu/pricing";
import { createServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { bool, num, str } from "@/lib/roomsetu/map";
import { hitLimit } from "@/lib/roomsetu/rate-limit";
import { buildUpiLink, makeRef, upiPayee } from "@/lib/roomsetu/upi";
import {
  allSaidYes,
  contactFeeInr,
  containsContactDetails,
  OWNER_NOTE_LIMIT,
  contactRefundDue,
  contactNeedsPayment,
  joinBlocker,
  makeInviteCode,
  OWNER_DECISIONS,
  parseSquadInput,
  type OwnerDecision,
} from "@/lib/roomsetu/contact";

function rec(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}
function key(v: unknown, label = "item"): string {
  if (typeof v !== "string" || !/^[0-9A-Za-z_-]{6,80}$/.test(v))
    throw new Error(`Unknown ${label}.`);
  return v;
}
async function profileOk(sql: Sql, userId: string) {
  const rows = await sql<{
    account_status: string;
    phone_verified_at: string | null;
    full_name: string;
  }>`select account_status, phone_verified_at, full_name from profiles where user_id = ${userId}`;
  const p = rows[0];
  if (!p) throw new Error("Finish your profile to continue.");
  if (p.account_status === "SUSPENDED") throw new Error("This account is suspended.");
  return p;
}
async function activeMembers(sql: Sql, squadId: string): Promise<string[]> {
  return (
    await sql<{
      user_id: string;
    }>`select user_id from squad_members where squad_id = ${squadId} and left_at is null order by joined_at`
  ).map((r) => r.user_id);
}
async function requireMember(sql: Sql, squadId: string, userId: string) {
  const s = await sql<Record<string, unknown>>`select * from squads where id = ${squadId}`;
  if (!s[0]) throw new Error("Squad not found.");
  const members = await activeMembers(sql, squadId);
  if (!members.includes(userId)) throw new Error("You are not in this squad.");
  return { squad: s[0], members };
}
async function systemMessage(sql: Sql, conversationId: string, senderId: string, body: string) {
  await sql`insert into messages (id, conversation_id, sender_id, body, kind) values (${crypto.randomUUID()}, ${conversationId}, ${senderId}, ${body}, 'SYSTEM')`;
  await sql`update conversations set updated_at = now() where id = ${conversationId}`;
}

// ---------------------------------------------------------------- contact unlock

async function isUnlocked(sql: Sql, listingId: string, userId: string): Promise<boolean> {
  const rows =
    await sql`select 1 from contact_unlocks where listing_id = ${listingId} and (seeker_id = ${userId}
    or squad_id in (select squad_id from squad_members where user_id = ${userId} and left_at is null)) limit 1`;
  return rows.length > 0;
}

/** Used by openConversation: throws unless the seeker has paid (hosts never pay). */
export async function assertContactAllowed(
  sql: Sql,
  listingId: string,
  viewerId: string,
  ownerId: string,
) {
  const unlocked = viewerId === ownerId ? true : await isUnlocked(sql, listingId, viewerId);
  if (!unlocked && pricingConfig().contactModel === "FREE_THEN_PASS") {
    await grantContact(sql, listingId, viewerId);
    return;
  }
  if (contactNeedsPayment({ viewerId, ownerId, unlocked, existingThread: false })) {
    throw new Error(`Pay the ₹${contactFeeInr()} contact fee to message this owner.`);
  }
}

/** Called after an admin approves a CONTACT payment: unlock + open the thread. */
export async function unlockFromPayment(sql: Sql, paymentId: string) {
  const rows = await sql<{
    user_id: string;
    listing_id: string;
    squad_id: string | null;
    kind: string;
    split_parts: number;
  }>`select user_id, listing_id, squad_id, kind, split_parts from payments where id = ${paymentId}`;
  const p = rows[0];
  if (!p || p.kind !== "CONTACT" || !p.listing_id) return;
  const listing = await sql<{
    owner_id: string;
    title: string;
  }>`select owner_id, title from listings where id = ${p.listing_id}`;
  if (!listing[0]) return;
  const owner = listing[0].owner_id;
  if (p.squad_id) {
    const req = await sql<{
      status: string;
    }>`select status from squad_requests where squad_id = ${p.squad_id} and listing_id = ${p.listing_id}`;
    if (req[0]?.status === "DECLINED") {
      await sql`update payments set status = 'REFUND_DUE', refund_due_at = now(), refund_reason = 'Owner declined before the payment was confirmed.' where id = ${paymentId}`;
      return;
    }
    const splitParts = num(p.split_parts);
    if (splitParts > 0) {
      const paid = await sql<{ n: number }>`select count(distinct user_id)::int as n from payments
        where squad_id = ${p.squad_id} and listing_id = ${p.listing_id} and kind = 'CONTACT' and split_parts > 0 and status = 'PAID'`;
      const sharesPaid = num(paid[0]?.n);
      if (!squadUnlockReady({ fullPaid: false, splitParts, sharesPaid })) {
        for (const m of await activeMembers(sql, p.squad_id)) {
          await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${m}, 'payment', 'Squad share confirmed', ${`${sharesPaid} of ${splitParts} shares paid for “${listing[0].title}”.`}, ${"/squads/" + p.squad_id})`;
        }
        return;
      }
    }
    const passCode = (await sql<{ pass_code: string | null }>`select pass_code from payments where id = ${paymentId}`)[0]?.pass_code;
    if (passCode === "SQUAD") {
      const passId = await startSquadPass(sql, p.squad_id, p.listing_id, paymentId);
      await sql`insert into contact_unlocks (id, listing_id, squad_id, payment_id, source, pass_id) values (${crypto.randomUUID()}, ${p.listing_id}, ${p.squad_id}, ${paymentId}, 'PASS', ${passId}) on conflict do nothing`;
    } else {
      await sql`insert into contact_unlocks (id, listing_id, squad_id, payment_id) values (${crypto.randomUUID()}, ${p.listing_id}, ${p.squad_id}, ${paymentId}) on conflict do nothing`;
    }
    await ensureSquadThread(sql, p.squad_id, p.listing_id, owner, p.user_id);
  } else {
    await sql`insert into contact_unlocks (id, listing_id, seeker_id, payment_id) values (${crypto.randomUUID()}, ${p.listing_id}, ${p.user_id}, ${paymentId}) on conflict do nothing`;
    const existing = await sql<{ id: string }>`select c.id from conversations c
      join conversation_members a on a.conversation_id = c.id and a.user_id = ${p.user_id}
      join conversation_members b on b.conversation_id = c.id and b.user_id = ${owner}
      where c.listing_id = ${p.listing_id} and c.squad_id is null limit 1`;
    const id = existing[0]?.id ?? crypto.randomUUID();
    if (!existing[0]) {
      await sql`insert into conversations (id, listing_id) values (${id}, ${p.listing_id})`;
      await sql`insert into conversation_members (conversation_id, user_id) values (${id}, ${p.user_id}), (${id}, ${owner})`;
    }
    await systemMessage(sql, id, p.user_id, `Contact unlocked for “${listing[0].title}”. Say hi!`);
    await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${p.user_id}, 'payment', 'Contact unlocked', 'You can now message the owner.', ${"/messages?thread=" + id})`;
  }
}

async function ensureSquadThread(
  sql: Sql,
  squadId: string,
  listingId: string,
  ownerId: string,
  actor: string,
) {
  const existing = await sql<{
    id: string;
  }>`select id from conversations where squad_id = ${squadId} and listing_id = ${listingId} limit 1`;
  const id = existing[0]?.id ?? crypto.randomUUID();
  if (!existing[0])
    await sql`insert into conversations (id, listing_id, squad_id) values (${id}, ${listingId}, ${squadId})`;
  for (const m of [...(await activeMembers(sql, squadId)), ownerId]) {
    await sql`insert into conversation_members (conversation_id, user_id) values (${id}, ${m}) on conflict do nothing`;
  }
  if (!existing[0])
    await systemMessage(
      sql,
      id,
      actor,
      "Squad chat with the owner is open. Everyone in the squad and the owner can see this thread.",
    );
  return id;
}

export const getContactStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => key(rec(input).listingId, "room"))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const l = await sql<{
      owner_id: string;
    }>`select owner_id from listings where id = ${data} and status <> 'REMOVED'`;
    if (!l[0]) throw new Error("That room is not available.");
    const isOwner = l[0].owner_id === context.userId;
    const unlocked = isOwner || (await isUnlocked(sql, data, context.userId));
    const open = await sql<{
      ref: string;
      status: string;
    }>`select ref, status from payments where user_id = ${context.userId} and listing_id = ${data} and kind = 'CONTACT' and squad_id is null and status in ('PENDING','SUBMITTED') limit 1`;
    const refund = await sql<{
      ref: string;
      status: string;
      refund_utr: string | null;
      payer_vpa: string | null;
    }>`select ref, status, refund_utr, payer_vpa from payments
      where user_id = ${context.userId} and listing_id = ${data} and kind = 'CONTACT' and squad_id is null and status in ('REFUND_DUE','REFUNDED') order by created_at desc limit 1`;
    const cfg = pricingConfig();
    const summary = await contactSummary(sql, context.userId);
    const pendingPass = await sql<{ ref: string; status: string; pass_code: string }>`select ref, status, pass_code from payments
      where user_id = ${context.userId} and kind = 'PASS' and status in ('PENDING','SUBMITTED') order by created_at desc limit 1`;
    return {
      fee: contactFeeInr(),
      model: cfg.contactModel,
      summary,
      passes: { weekly: cfg.passes.WEEKLY.priceInr, monthly: cfg.passes.MONTHLY.priceInr, enabled: cfg.passesEnabled },
      pendingPass: pendingPass[0] ? { ref: str(pendingPass[0].ref), status: str(pendingPass[0].status), code: str(pendingPass[0].pass_code) } : null,
      isOwner,
      unlocked,
      pending: open[0] ? { ref: str(open[0].ref), status: str(open[0].status) } : null,
      upiReady: upiPayee().ready,
      refund: refund[0]
        ? {
            ref: str(refund[0].ref),
            status: str(refund[0].status),
            utr: str(refund[0].refund_utr),
            vpa: str(refund[0].payer_vpa),
          }
        : null,
    };
  });

export const startContactCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    return {
      listingId: key(o.listingId, "room"),
      squadId: o.squadId ? key(o.squadId, "squad") : "",
      mode: (o.mode === "SPLIT" ? "SPLIT" : "FULL") as SquadPayMode,
    };
  })
  .handler(async ({ context, data }) => {
    const payee = upiPayee();
    if (!payee.ready) throw new Error("UPI payments are not set up yet.");
    const sql = await getSql();
    await profileOk(sql, context.userId);
    const l = await sql<{
      owner_id: string;
      title: string;
    }>`select owner_id, title from listings where id = ${data.listingId} and status <> 'REMOVED'`;
    if (!l[0]) throw new Error("That room is not available.");
    if (l[0].owner_id === context.userId) throw new Error("Hosts never pay to talk to seekers.");
    const squadId = data.squadId || null;
    if (!squadId && pricingConfig().contactModel === "FREE_THEN_PASS")
      throw new Error("Contacts are free or covered by a pass now. Use your free contacts or get a pass.");
    let splitMembers = 0;
    let memberCount = 0;
    if (squadId) {
      memberCount = (await requireMember(sql, squadId, context.userId)).members.length;
      if (await squadActivePass(sql, squadId)) throw new Error("Your squad pass is active. Send requests and chat for free.");
      const req = await sql<{
        status: string;
      }>`select status from squad_requests where squad_id = ${squadId} and listing_id = ${data.listingId}`;
      if (!req[0] || req[0].status === "DECLINED") throw new Error("Send the joint request first.");
      if (
        (
          await sql`select 1 from contact_unlocks where listing_id = ${data.listingId} and squad_id = ${squadId}`
        ).length
      )
        throw new Error("Your squad already unlocked this owner.");
      const others = await sql<{
        user_id: string;
        status: string;
        split_parts: number;
      }>`select user_id, status, split_parts from payments where squad_id = ${squadId} and listing_id = ${data.listingId} and kind = 'CONTACT' and status in ('SUBMITTED','PAID')`;
      const fullOther = others.find((o) => num(o.split_parts) === 0 && (o.status === "PAID" || o.user_id !== context.userId));
      if (fullOther) throw new Error("Someone in your squad already paid. Waiting for Roomeo to confirm.");
      const split = others.filter((o) => num(o.split_parts) > 0);
      if (data.mode === "FULL" && split.some((o) => o.user_id !== context.userId))
        throw new Error("Your squad is splitting the fee. Pay your share instead.");
      if (data.mode === "SPLIT") {
        if (split.some((o) => o.user_id === context.userId && o.status === "PAID")) throw new Error("Your share is already paid.");
        splitMembers = num(split[0]?.split_parts) || (await activeMembers(sql, squadId)).length;
      }
    } else if (await isUnlocked(sql, data.listingId, context.userId)) {
      throw new Error("Contact is already unlocked.");
    }
    const cfg = pricingConfig();
    const quote = contactQuote(cfg, { squadMembers: squadId ? (data.mode === "SPLIT" ? splitMembers : memberCount) : 0, mode: squadId ? data.mode : "FULL" });
    const passCode = squadId && cfg.contactModel === "FREE_THEN_PASS" ? "SQUAD" : null;
    const amount = quote.amountInr;
    const purpose = (passCode ? `Squad pass${quote.splitParts ? " (squad share)" : ""}: ${l[0].title}` : `Contact unlock${squadId ? (quote.splitParts ? " (squad share)" : " (squad)") : ""}: ${l[0].title}`).slice(0, 120);
    const find = () => sql<{
      ref: string;
      status: string;
      amount_inr: number;
      split_parts: number;
    }>`select ref, status, amount_inr, split_parts from payments
      where user_id = ${context.userId} and listing_id = ${data.listingId} and coalesce(squad_id, '') = ${squadId ?? ""} and kind = 'CONTACT' and provider = 'UPI' and status in ('PENDING','SUBMITTED') limit 1`;
    let row = (await find())[0];
    if (row && num(row.split_parts) !== quote.splitParts) {
      if (row.status === "SUBMITTED") throw new Error("Your earlier payment is being checked. Wait for it first.");
      await sql`update payments set amount_inr = ${amount}, split_parts = ${quote.splitParts}, purpose = ${purpose}, pass_code = ${passCode} where ref = ${row.ref} and status = 'PENDING'`;
      row = (await find())[0];
    }
    if (!row) {
      await sql`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, squad_id, split_parts, pass_code)
        values (${crypto.randomUUID()}, ${context.userId}, ${purpose}, ${amount}, 'PENDING', 'UPI', ${makeRef()}, 'CONTACT', ${data.listingId}, ${squadId}, ${quote.splitParts}, ${passCode}) on conflict do nothing`;
      row = (await find())[0];
    }
    if (!row) throw new Error("Could not start the payment. Try again.");
    const link = buildUpiLink({
      vpa: payee.vpa,
      name: payee.name,
      amountInr: num(row.amount_inr),
      ref: str(row.ref),
    });
    const qr = await QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M" });
    return {
      ref: str(row.ref),
      status: str(row.status),
      amount: num(row.amount_inr),
      plan: squadId
        ? passCode
          ? quote.splitParts ? `your squad pass share (1 of ${quote.splitParts})` : "the squad pass"
          : quote.splitParts ? `your squad share (1 of ${quote.splitParts})` : "squad contact unlock"
        : "contact unlock",
      payee: payee.name,
      vpa: payee.vpa,
      link,
      qr,
    };
  });

/**
 * Owner declined: the paid contact fee becomes REFUND_DUE (operator refunds by UPI by hand),
 * the unlock is revoked and the thread is closed.
 */
export async function markContactRefundDue(
  sql: Sql,
  p: { listingId: string; seekerId?: string; squadId?: string; reason: string },
) {
  const declined = await recordDecline(sql, { listingId: p.listingId, seekerId: p.seekerId, squadId: p.squadId });
  const rows = p.squadId
    ? await sql<{
        id: string;
        user_id: string;
      }>`update payments set status = 'REFUND_DUE', refund_due_at = now(), refund_reason = ${p.reason}
        where kind = 'CONTACT' and status = 'PAID' and pass_code is null and listing_id = ${p.listingId} and squad_id = ${p.squadId} returning id, user_id`
    : await sql<{
        id: string;
        user_id: string;
      }>`update payments set status = 'REFUND_DUE', refund_due_at = now(), refund_reason = ${p.reason}
        where kind = 'CONTACT' and status = 'PAID' and pass_code is null and listing_id = ${p.listingId} and squad_id is null and user_id = ${p.seekerId ?? ""} returning id, user_id`;
  if (p.squadId)
    await sql`delete from contact_unlocks where listing_id = ${p.listingId} and squad_id = ${p.squadId} and source = 'PAID'`;
  else
    await sql`delete from contact_unlocks where listing_id = ${p.listingId} and seeker_id = ${p.seekerId ?? ""} and source = 'PAID'`;
  const threads = p.squadId
    ? await sql<{
        id: string;
      }>`select id from conversations where squad_id = ${p.squadId} and listing_id = ${p.listingId} and closed_at is null`
    : await sql<{
        id: string;
      }>`select c.id from conversations c join conversation_members m on m.conversation_id = c.id and m.user_id = ${p.seekerId ?? ""}
        where c.listing_id = ${p.listingId} and c.squad_id is null and c.closed_at is null`;
  for (const t of threads) {
    const body = rows.length
      ? "The owner declined, so this chat is closed. Your contact fee will be refunded to your UPI ID."
      : declined.some((d) => d.source === "FREE")
        ? "The owner declined, so this chat is closed. Your free contact is back."
        : "The owner declined, so this chat is closed. It counts toward your pass refund promise.";
    await sql`insert into messages (id, conversation_id, sender_id, body, kind) select ${crypto.randomUUID()}, ${t.id}, user_id, ${body}, 'SYSTEM' from conversation_members where conversation_id = ${t.id} limit 1`;
    await sql`update conversations set closed_at = now(), updated_at = now() where id = ${t.id}`;
  }
  for (const r of rows) {
    await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${r.user_id}, 'payment', 'Refund on the way', 'The owner declined, so your contact fee will be refunded to your UPI ID.', '/dashboard')`;
  }
  return rows.length;
}

// ---------------------------------------------------------------- squads

export const createSquad = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseSquadInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const p = await profileOk(sql, context.userId);
    if (!p.phone_verified_at) throw new Error("Verify your phone number before starting a squad.");
    await hitLimit(sql, context.userId, "squad");
    const id = crypto.randomUUID();
    await sql`insert into squads (id, creator_id, name, area, budget_per_person, move_in, size, invite_code)
      values (${id}, ${context.userId}, ${data.name}, ${data.area}, ${data.budgetPerPerson}, ${data.moveIn || null}, ${data.size}, ${makeInviteCode()})`;
    await sql`insert into squad_members (squad_id, user_id) values (${id}, ${context.userId})`;
    return { id };
  });

export const mySquads = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select s.id, s.name, s.area, s.size, s.status, s.budget_per_person,
              (select count(*)::int from squad_members m where m.squad_id = s.id and m.left_at is null) as members
       from squads s join squad_members me on me.squad_id = s.id and me.user_id = $1 and me.left_at is null
       order by s.created_at desc`,
      [context.userId],
    );
    return rows.map((r) => ({
      id: str(r.id),
      name: str(r.name),
      area: str(r.area),
      size: num(r.size),
      members: num(r.members),
      status: str(r.status),
      budget: num(r.budget_per_person),
    }));
  });

export const squadPreview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => key(rec(input).code, "invite"))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const s = await sql<
      Record<string, unknown>
    >`select id, name, area, size, status, budget_per_person, move_in::text as move_in from squads where invite_code = ${data}`;
    if (!s[0]) throw new Error("That invite link is not valid.");
    const members = await sql<{
      full_name: string;
      user_id: string;
    }>`select p.full_name, p.user_id from squad_members m join profiles p on p.user_id = m.user_id where m.squad_id = ${str(s[0].id)} and m.left_at is null`;
    const me = await sql<{
      phone_verified_at: string | null;
    }>`select phone_verified_at from profiles where user_id = ${context.userId}`;
    return {
      id: str(s[0].id),
      name: str(s[0].name),
      area: str(s[0].area),
      size: num(s[0].size),
      status: str(s[0].status),
      budget: num(s[0].budget_per_person),
      moveIn: str(s[0].move_in),
      members: members.map((m) => m.full_name),
      alreadyMember: members.some((m) => m.user_id === context.userId),
      phoneVerified: Boolean(me[0]?.phone_verified_at),
    };
  });

export const joinSquad = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => key(rec(input).code, "invite"))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const p = await profileOk(sql, context.userId);
    await hitLimit(sql, context.userId, "squad");
    const s = await sql<{
      id: string;
      size: number;
      status: string;
    }>`select id, size, status from squads where invite_code = ${data}`;
    if (!s[0]) throw new Error("That invite link is not valid.");
    const members = await activeMembers(sql, s[0].id);
    const blocker = joinBlocker({
      phoneVerified: Boolean(p.phone_verified_at),
      activeMembers: members.length,
      size: num(s[0].size),
      alreadyMember: members.includes(context.userId),
      status: s[0].status,
    });
    if (blocker) throw new Error(blocker);
    if (!members.includes(context.userId)) {
      await sql`insert into squad_members (squad_id, user_id) values (${s[0].id}, ${context.userId}) on conflict (squad_id, user_id) do update set left_at = null, joined_at = now()`;
      if (members.length + 1 >= num(s[0].size))
        await sql`update squads set status = 'FULL', updated_at = now() where id = ${s[0].id}`;
      // Join any squad chat that is already unlocked.
      for (const c of await sql<{
        id: string;
      }>`select id from conversations where squad_id = ${s[0].id}`) {
        await sql`insert into conversation_members (conversation_id, user_id) values (${c.id}, ${context.userId}) on conflict do nothing`;
        await systemMessage(
          sql,
          c.id,
          context.userId,
          `${p.full_name || "A new member"} joined the squad.`,
        );
      }
    }
    return { id: s[0].id };
  });

export const leaveSquad = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => key(rec(input).squadId, "squad"))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { members } = await requireMember(sql, data, context.userId);
    const p = await profileOk(sql, context.userId);
    await sql`update squad_members set left_at = now() where squad_id = ${data} and user_id = ${context.userId}`;
    const remaining = members.length - 1;
    await sql`update squads set status = ${remaining === 0 ? "CLOSED" : "OPEN"}, updated_at = now() where id = ${data}`;
    // A spot reopened: pause live requests until the squad is full and agrees again.
    await sql`update squad_requests set status = 'PAUSED', updated_at = now() where squad_id = ${data} and status in ('PENDING','ACCEPTED','VISIT_PROPOSED')`;
    await sql`delete from squad_votes where squad_id = ${data} and user_id = ${context.userId}`;
    for (const c of await sql<{
      id: string;
    }>`select id from conversations where squad_id = ${data}`) {
      await systemMessage(
        sql,
        c.id,
        context.userId,
        `${p.full_name || "A member"} left the squad. A spot is open again; the request is paused.`,
      );
      await sql`delete from conversation_members where conversation_id = ${c.id} and user_id = ${context.userId}`;
    }
    return { ok: true };
  });

export const getSquad = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => key(rec(input).squadId, "squad"))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { squad, members } = await requireMember(sql, data, context.userId);
    const people = await sql.query<Record<string, unknown>>(
      `select p.user_id, p.full_name, p.age, p.occupation, p.identity_status, p.phone_verified_at is not null as phone_ok
       from squad_members m join profiles p on p.user_id = m.user_id where m.squad_id = $1 and m.left_at is null order by m.joined_at`,
      [data],
    );
    const shortlist = await sql.query<Record<string, unknown>>(
      `select s.listing_id, l.title, l.locality_name, l.monthly_rent, l.listing_kind, l.bedrooms, l.status, l.owner_id,
              r.id as request_id, r.status as request_status, r.owner_note,
              exists (select 1 from contact_unlocks u where u.listing_id = s.listing_id and u.squad_id = s.squad_id) as unlocked,
              (select c.id from conversations c where c.squad_id = s.squad_id and c.listing_id = s.listing_id limit 1) as thread_id,
              (select p.status from payments p where p.squad_id = s.squad_id and p.listing_id = s.listing_id and p.kind = 'CONTACT' and p.status in ('PENDING','SUBMITTED') order by (p.status = 'SUBMITTED') desc limit 1) as pay_status,
              (select coalesce(max(p.split_parts), 0) from payments p where p.squad_id = s.squad_id and p.listing_id = s.listing_id and p.kind = 'CONTACT' and p.split_parts > 0 and p.status in ('PENDING','SUBMITTED','PAID')) as split_parts,
              (select count(distinct p.user_id)::int from payments p where p.squad_id = s.squad_id and p.listing_id = s.listing_id and p.kind = 'CONTACT' and p.split_parts > 0 and p.status = 'PAID') as shares_paid,
              (select p.status from payments p where p.squad_id = s.squad_id and p.listing_id = s.listing_id and p.kind = 'CONTACT' and p.user_id = $2 and p.status in ('PENDING','SUBMITTED','PAID') order by p.created_at desc limit 1) as my_pay_status,
              coalesce(r.notes_count, 0) as notes_count,
              (select p.status || '|' || coalesce(p.refund_utr, '') || '|' || coalesce(p.payer_vpa, '') from payments p where p.squad_id = s.squad_id and p.listing_id = s.listing_id and p.kind = 'CONTACT' and p.status in ('REFUND_DUE','REFUNDED') order by p.created_at desc limit 1) as refund
       from squad_shortlist s join listings l on l.id = s.listing_id
       left join squad_requests r on r.squad_id = s.squad_id and r.listing_id = s.listing_id
       where s.squad_id = $1 order by s.created_at`,
      [data, context.userId],
    );
    const votes = await sql<{
      listing_id: string;
      user_id: string;
      vote: boolean;
    }>`select listing_id, user_id, vote from squad_votes where squad_id = ${data}`;
    const size = num(squad.size);
    return {
      id: str(squad.id),
      name: str(squad.name),
      area: str(squad.area),
      size,
      status: str(squad.status),
      budget: num(squad.budget_per_person),
      moveIn: str(squad.move_in).slice(0, 10),
      inviteCode: str(squad.invite_code),
      me: context.userId,
      fee: squadFeeInr(pricingConfig(), members.length),
      model: pricingConfig().contactModel,
      perMember: pricingConfig().passes.SQUAD.priceInr,
      passEndsAt: str((await squadActivePass(sql, data))?.ends_at),
      myContacts: await contactSummary(sql, context.userId),
      splitEnabled: pricingConfig().squadSplitEnabled,
      members: people.map((p) => ({
        id: str(p.user_id),
        name: str(p.full_name),
        age: num(p.age),
        occupation: str(p.occupation),
        idVerified: str(p.identity_status) === "VERIFIED",
        phoneVerified: bool(p.phone_ok),
      })),
      shortlist: shortlist.map((s) => {
        const lid = str(s.listing_id);
        const v = votes.filter((x) => x.listing_id === lid && members.includes(x.user_id));
        const yesIds = v.filter((x) => x.vote).map((x) => x.user_id);
        return {
          listingId: lid,
          title: str(s.title),
          locality: str(s.locality_name),
          rent: num(s.monthly_rent),
          kind: str(s.listing_kind),
          bedrooms: num(s.bedrooms),
          listingStatus: str(s.status),
          requestStatus: str(s.request_status),
          requestId: str(s.request_id),
          ownerNote: str(s.owner_note),
          unlocked: bool(s.unlocked),
          threadId: str(s.thread_id),
          payStatus: str(s.pay_status),
          refund: str(s.refund),
          splitParts: num(s.split_parts),
          sharesPaid: num(s.shares_paid),
          myPayStatus: str(s.my_pay_status),
          votes: Object.fromEntries(v.map((x) => [x.user_id, x.vote])),
          allYes: allSaidYes({ size, memberIds: members, yesIds }),
        };
      }),
    };
  });

export const shortlistListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    return {
      squadId: key(o.squadId, "squad"),
      listingId: key(o.listingId, "room"),
      remove: o.remove === true,
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireMember(sql, data.squadId, context.userId);
    if (data.remove) {
      await sql`delete from squad_shortlist where squad_id = ${data.squadId} and listing_id = ${data.listingId}
        and not exists (select 1 from squad_requests r where r.squad_id = ${data.squadId} and r.listing_id = ${data.listingId})`;
      return { ok: true };
    }
    const l = await sql`select 1 from listings where id = ${data.listingId} and status = 'ACTIVE'`;
    if (!l.length) throw new Error("That flat is not available.");
    const count = await sql<{
      n: number;
    }>`select count(*)::int as n from squad_shortlist where squad_id = ${data.squadId}`;
    if (num(count[0]?.n) >= 20) throw new Error("Shortlist is full (20).");
    await sql`insert into squad_shortlist (squad_id, listing_id, added_by) values (${data.squadId}, ${data.listingId}, ${context.userId}) on conflict do nothing`;
    return { ok: true };
  });

export const voteListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    if (typeof o.yes !== "boolean") throw new Error("Vote yes or no.");
    return { squadId: key(o.squadId, "squad"), listingId: key(o.listingId, "room"), yes: o.yes };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireMember(sql, data.squadId, context.userId);
    const on =
      await sql`select 1 from squad_shortlist where squad_id = ${data.squadId} and listing_id = ${data.listingId}`;
    if (!on.length) throw new Error("Add it to the shortlist first.");
    await sql`insert into squad_votes (squad_id, listing_id, user_id, vote) values (${data.squadId}, ${data.listingId}, ${context.userId}, ${data.yes})
      on conflict (squad_id, listing_id, user_id) do update set vote = excluded.vote, updated_at = now()`;
    return { ok: true };
  });

export const sendJointRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    return { squadId: key(o.squadId, "squad"), listingId: key(o.listingId, "room") };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { squad, members } = await requireMember(sql, data.squadId, context.userId);
    await hitLimit(sql, context.userId, "apply");
    const l = await sql<{
      owner_id: string;
    }>`select owner_id from listings where id = ${data.listingId} and status = 'ACTIVE'`;
    if (!l[0]) throw new Error("That flat is not available.");
    if (members.includes(l[0].owner_id)) throw new Error("You cannot request your own flat.");
    const yes = (
      await sql<{
        user_id: string;
      }>`select user_id from squad_votes where squad_id = ${data.squadId} and listing_id = ${data.listingId} and vote = true`
    ).map((r) => r.user_id);
    if (!allSaidYes({ size: num(squad.size), memberIds: members, yesIds: yes }))
      throw new Error("Everyone in a full squad has to vote yes first.");
    const existing = await sql<{
      status: string;
    }>`select status from squad_requests where squad_id = ${data.squadId} and listing_id = ${data.listingId}`;
    if (existing[0] && existing[0].status !== "PAUSED") throw new Error("Request already sent.");
    if (existing[0]) {
      await sql`update squad_requests set status = 'PENDING', updated_at = now() where squad_id = ${data.squadId} and listing_id = ${data.listingId}`;
    } else {
      await sql`insert into squad_requests (id, squad_id, listing_id, owner_id) values (${crypto.randomUUID()}, ${data.squadId}, ${data.listingId}, ${l[0].owner_id})`;
    }
    // Squad pass active: the request opens the squad chat with the owner straight away.
    const pass = await squadActivePass(sql, data.squadId);
    if (pass) {
      await sql`insert into contact_unlocks (id, listing_id, squad_id, source, pass_id) values (${crypto.randomUUID()}, ${data.listingId}, ${data.squadId}, 'PASS', ${pass.id}) on conflict do nothing`;
      await ensureSquadThread(sql, data.squadId, data.listingId, l[0].owner_id, context.userId);
    }
    await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${l[0].owner_id}, 'squad', 'New squad request', ${`${str(squad.name)} (${members.length} people) want your flat.`}, '/squads')`;
    return { ok: true };
  });

/** Owner side: joint requests for my listings with members' profiles and combined budget. */
export const ownerSquadRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select r.id, r.status, r.owner_note, coalesce(r.notes_count, 0) as notes_count, r.listing_id, r.squad_id, l.title, l.monthly_rent, s.name as squad_name, s.size, s.budget_per_person, s.move_in::text as move_in,
              (select c.id from conversations c where c.squad_id = r.squad_id and c.listing_id = r.listing_id limit 1) as thread_id
       from squad_requests r join listings l on l.id = r.listing_id join squads s on s.id = r.squad_id
       where r.owner_id = $1 order by r.updated_at desc limit 50`,
      [context.userId],
    );
    const out = [];
    for (const r of rows) {
      const people = await sql.query<Record<string, unknown>>(
        `select p.full_name, p.age, p.occupation, p.identity_status, p.phone_verified_at is not null as phone_ok
         from squad_members m join profiles p on p.user_id = m.user_id where m.squad_id = $1 and m.left_at is null order by m.joined_at`,
        [str(r.squad_id)],
      );
      out.push({
        id: str(r.id),
        status: str(r.status),
        note: str(r.owner_note),
        notesLeft: Math.max(0, OWNER_NOTE_LIMIT - num(r.notes_count)),
        listingId: str(r.listing_id),
        title: str(r.title),
        rent: num(r.monthly_rent),
        squadName: str(r.squad_name),
        size: num(r.size),
        moveIn: str(r.move_in).slice(0, 10),
        threadId: str(r.thread_id),
        combinedBudget: num(r.budget_per_person) * people.length,
        members: people.map((p) => ({
          name: str(p.full_name),
          age: num(p.age),
          occupation: str(p.occupation),
          idVerified: str(p.identity_status) === "VERIFIED",
          phoneVerified: bool(p.phone_ok),
        })),
      });
    }
    return out;
  });

export const ownerDecideSquad = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    const decision = String(o.decision) as OwnerDecision;
    if (!OWNER_DECISIONS.includes(decision)) throw new Error("Unknown decision.");
    const note = typeof o.note === "string" ? o.note.trim().slice(0, 300) : "";
    if (note && containsContactDetails(note))
      throw new Error("Keep phone numbers, emails and links out of notes. Chat opens once the squad pays.");
    if (decision === "VISIT_PROPOSED" && note.length < 3)
      throw new Error("Suggest a day and time for the visit.");
    return { id: key(o.id, "request"), decision, note };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{
      squad_id: string;
      status: string;
      listing_id: string;
    }>`select squad_id, status, listing_id from squad_requests where id = ${data.id} and owner_id = ${context.userId}`;
    if (!rows[0]) throw new Error("That request is not for your flat.");
    if (rows[0].status === "PAUSED")
      throw new Error("This squad changed members. Wait for them to resend.");
    await sql`update squad_requests set status = ${data.decision}, owner_note = ${data.note}, updated_at = now() where id = ${data.id}`;
    if (contactRefundDue({ decision: data.decision, previousStatus: rows[0].status })) {
      await markContactRefundDue(sql, {
        listingId: rows[0].listing_id,
        squadId: rows[0].squad_id,
        reason: "Owner declined the squad request.",
      });
    }
    for (const m of await activeMembers(sql, rows[0].squad_id)) {
      await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${m}, 'squad', 'Owner replied', ${`Your squad request is now ${data.decision.toLowerCase().replace("_", " ")}.`}, ${"/squads/" + rows[0].squad_id})`;
    }
    return { ok: true };
  });

/**
 * Owner sends a short note to a squad before they pay (e.g. "visits on Saturday").
 * Limited to OWNER_NOTE_LIMIT per request and screened for contact details; real chat stays paid.
 */
export const ownerSquadNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    const note = typeof o.note === "string" ? o.note.trim().replace(/\s+/g, " ") : "";
    if (note.length < 2) throw new Error("Write a short note.");
    if (note.length > 200) throw new Error("Keep it under 200 characters.");
    if (containsContactDetails(note))
      throw new Error("Keep phone numbers, emails and links out of notes. Chat opens once the squad pays.");
    return { id: key(o.id, "request"), note };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await hitLimit(sql, context.userId, "squad");
    const rows = await sql<{ squad_id: string; status: string; notes_count: number }>`select squad_id, status, notes_count from squad_requests where id = ${data.id} and owner_id = ${context.userId}`;
    const r = rows[0];
    if (!r) throw new Error("That request is not for your flat.");
    if (r.status === "DECLINED" || r.status === "PAUSED") throw new Error("This request is closed.");
    if (num(r.notes_count) >= OWNER_NOTE_LIMIT) throw new Error(`You can send ${OWNER_NOTE_LIMIT} notes before the squad pays.`);
    const updated = await sql<{ id: string }>`update squad_requests set owner_note = ${data.note}, notes_count = notes_count + 1, updated_at = now()
      where id = ${data.id} and notes_count < ${OWNER_NOTE_LIMIT} returning id`;
    if (!updated[0]) throw new Error(`You can send ${OWNER_NOTE_LIMIT} notes before the squad pays.`);
    for (const m of await activeMembers(sql, r.squad_id)) {
      await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${m}, 'squad', 'Note from the owner', ${data.note}, ${"/squads/" + r.squad_id})`;
    }
    return { ok: true, notesLeft: OWNER_NOTE_LIMIT - num(r.notes_count) - 1 };
  });

// ---------------------------------------------------------------- squad unlock from a member + squad move in

/** A member spends one of their free chats, or uses their personal pass, to open the squad chat. */
export const unlockSquadWithMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    if (o.use !== "FREE" && o.use !== "PASS") throw new Error("Pick a free chat or your pass.");
    return { squadId: key(o.squadId, "squad"), listingId: key(o.listingId, "room"), use: o.use as "FREE" | "PASS" };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireMember(sql, data.squadId, context.userId);
    const req = await sql<{ status: string; owner_id: string }>`select status, owner_id from squad_requests where squad_id = ${data.squadId} and listing_id = ${data.listingId}`;
    if (!req[0] || req[0].status === "DECLINED" || req[0].status === "PAUSED") throw new Error("Send the joint request first.");
    if ((await sql`select 1 from contact_unlocks where listing_id = ${data.listingId} and squad_id = ${data.squadId}`).length)
      throw new Error("Your squad already unlocked this owner.");
    const open = await sql`select 1 from payments where squad_id = ${data.squadId} and listing_id = ${data.listingId} and kind = 'CONTACT' and status in ('SUBMITTED','PAID')`;
    if (open.length) throw new Error("Your squad already paid for this owner. Wait for Roomeo to confirm.");
    await grantSquadContactFromMember(sql, { squadId: data.squadId, listingId: data.listingId, userId: context.userId, use: data.use });
    const threadId = await ensureSquadThread(sql, data.squadId, data.listingId, req[0].owner_id, context.userId);
    return { threadId };
  });

async function squadMoveInState(sql: Sql, requestId: string, userId: string) {
  const r = await sql<{ id: string; squad_id: string; listing_id: string; owner_id: string; status: string }>`select id, squad_id, listing_id, owner_id, status from squad_requests where id = ${requestId}`;
  const req = r[0];
  if (!req) throw new Error("Request not found.");
  const members = await activeMembers(sql, req.squad_id);
  const isOwner = req.owner_id === userId;
  if (!isOwner && !members.includes(userId)) throw new Error("Request not found.");
  const m = (await sql<{ id: string; owner_confirmed_at: string | null; confirmed_at: string | null }>`select id, owner_confirmed_at::text, confirmed_at::text from squad_move_ins where squad_request_id = ${requestId}`)[0] ?? null;
  const confirmedIds = m ? (await sql<{ user_id: string }>`select user_id from squad_move_in_confirms where squad_move_in_id = ${m.id}`).map((x) => x.user_id) : [];
  return { req, members, isOwner, m, confirmedIds };
}

export const squadMoveInStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => key(rec(input).requestId, "request"))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const st = await squadMoveInState(sql, data, context.userId);
    const cfg = pricingConfig();
    const fee = await sql<{ status: string }>`select status from payments where kind = 'SUCCESS_FEE' and squad_id = ${st.req.squad_id} and listing_id = ${st.req.listing_id} and user_id = ${context.userId} order by created_at desc limit 1`;
    return {
      requestStatus: st.req.status,
      members: st.members.length,
      membersConfirmed: st.members.filter((id) => st.confirmedIds.includes(id)).length,
      ownerConfirmed: Boolean(st.m?.owner_confirmed_at),
      confirmed: Boolean(st.m?.confirmed_at),
      meConfirmed: st.isOwner ? Boolean(st.m?.owner_confirmed_at) : st.confirmedIds.includes(context.userId),
      isOwner: st.isOwner,
      feeEnabled: cfg.successFeeEnabled,
      myFee: feeWithGst(st.isOwner ? cfg.successFeeOwnerInr : cfg.successFeeTenantInr).total,
      feeStatus: str(fee[0]?.status),
    };
  });

export const confirmSquadMoveIn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => key(rec(input).requestId, "request"))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const st = await squadMoveInState(sql, data, context.userId);
    if (st.req.status !== "ACCEPTED") throw new Error("The owner has to accept the squad first.");
    await sql`insert into squad_move_ins (id, squad_request_id, squad_id, listing_id, owner_id) values (${crypto.randomUUID()}, ${data}, ${st.req.squad_id}, ${st.req.listing_id}, ${st.req.owner_id}) on conflict (squad_request_id) do nothing`;
    const mid = (await sql<{ id: string }>`select id from squad_move_ins where squad_request_id = ${data}`)[0].id;
    if (st.isOwner) await sql`update squad_move_ins set owner_confirmed_at = coalesce(owner_confirmed_at, now()) where id = ${mid}`;
    else await sql`insert into squad_move_in_confirms (squad_move_in_id, user_id) values (${mid}, ${context.userId}) on conflict do nothing`;
    const after = await squadMoveInState(sql, data, context.userId);
    const done = squadMoveInConfirmed({ memberIds: after.members, confirmedIds: after.confirmedIds, ownerConfirmed: Boolean(after.m?.owner_confirmed_at) });
    if (done && !after.m?.confirmed_at) {
      await sql`update squad_move_ins set confirmed_at = now() where id = ${mid} and confirmed_at is null`;
      for (const u of [...after.members, after.req.owner_id])
        await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${u}, 'squad', 'Move in confirmed', 'Everyone confirmed the move in. Welcome home.', ${"/squads/" + after.req.squad_id})`;
    }
    return { confirmed: done };
  });

export const startSquadSuccessFee = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => key(rec(input).requestId, "request"))
  .handler(async ({ context, data }) => {
    const cfg = pricingConfig();
    if (!cfg.successFeeEnabled) throw new Error("There is no move in fee right now.");
    // The fee is now paid from the signed squad agreement (agreement-api startAgreementFee).
    if (cfg.successFeeEnabled) throw new Error("Everyone signs the Roomeo agreement first. The fee is paid from there.");
    const payee = upiPayee();
    if (!payee.ready) throw new Error("UPI payments are not set up yet.");
    const sql = await getSql();
    const st = await squadMoveInState(sql, data, context.userId);
    if (!st.m?.confirmed_at) throw new Error("Everyone confirms the move in first.");
    // Every squad member pays the full one-time fee + GST (no split); the owner pays once.
    const amount = feeWithGst(st.isOwner ? cfg.successFeeOwnerInr : cfg.successFeeTenantInr).total;
    if (amount <= 0) throw new Error("There is no move in fee for you.");
    const find = () => sql<{ ref: string; status: string; amount_inr: number }>`select ref, status, amount_inr from payments
      where kind = 'SUCCESS_FEE' and squad_id = ${st.req.squad_id} and listing_id = ${st.req.listing_id} and user_id = ${context.userId} and status in ('PENDING','SUBMITTED','PAID') order by created_at desc limit 1`;
    let row = (await find())[0];
    if (row?.status === "PAID") throw new Error("Already paid. Thanks.");
    if (!row) {
      await sql`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, squad_id)
        values (${crypto.randomUUID()}, ${context.userId}, ${st.isOwner ? "Success fee incl. GST (owner, squad)" : "Success fee incl. GST (squad member)"}, ${amount}, 'PENDING', 'UPI', ${makeRef()}, 'SUCCESS_FEE', ${st.req.listing_id}, ${st.req.squad_id})`;
      row = (await find())[0];
    }
    const link = buildUpiLink({ vpa: payee.vpa, name: payee.name, amountInr: num(row.amount_inr), ref: str(row.ref) });
    const qr = await QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M" });
    return { ref: str(row.ref), status: str(row.status), amount: num(row.amount_inr), plan: st.isOwner ? "the move in fee" : "your share of the move in fee", payee: payee.name, vpa: payee.vpa, link, qr };
  });
