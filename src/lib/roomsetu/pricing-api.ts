import { createServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertAdmin, audit } from "@/lib/roomsetu/admin-api";
import { num, str } from "@/lib/roomsetu/map";
import { buildUpiLink, makeRef, upiPayee } from "@/lib/roomsetu/upi";
import { pricingConfig, moveInConfirmed, REFUND_PROMISE } from "@/lib/roomsetu/pricing";
import { contactSummary, runPricingSweep } from "@/lib/roomsetu/pricing-db";

function rec(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}
function key(v: unknown, label = "item"): string {
  if (typeof v !== "string" || !/^[0-9A-Za-z_-]{6,80}$/.test(v)) throw new Error(`Unknown ${label}.`);
  return v;
}

/** One open UPI checkout per user + kind (+ listing). Reuses a pending one. */
async function upiCheckout(
  sql: Sql,
  userId: string,
  p: { kind: string; passCode?: string | null; listingId?: string | null; amount: number; purpose: string; label: string },
) {
  const payee = upiPayee();
  if (!payee.ready) throw new Error("UPI payments are not set up yet.");
  const find = () => sql<{ ref: string; status: string; amount_inr: number }>`select ref, status, amount_inr from payments
    where user_id = ${userId} and kind = ${p.kind} and coalesce(pass_code, '') = ${p.passCode ?? ""} and coalesce(listing_id, '') = ${p.listingId ?? ""}
      and provider = 'UPI' and status in ('PENDING','SUBMITTED') order by created_at desc limit 1`;
  let row = (await find())[0];
  if (!row) {
    await sql`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, pass_code)
      values (${crypto.randomUUID()}, ${userId}, ${p.purpose.slice(0, 120)}, ${p.amount}, 'PENDING', 'UPI', ${makeRef()}, ${p.kind}, ${p.listingId ?? null}, ${p.passCode ?? null})`;
    row = (await find())[0];
  }
  if (!row) throw new Error("Could not start the payment. Try again.");
  const link = buildUpiLink({ vpa: payee.vpa, name: payee.name, amountInr: num(row.amount_inr), ref: str(row.ref) });
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M" });
  return { ref: str(row.ref), status: str(row.status), amount: num(row.amount_inr), plan: p.label, payee: payee.name, vpa: payee.vpa, link, qr };
}

/** Public numbers for /pricing. No auth. */
export const getPublicPricing = createServerFn({ method: "GET" }).handler(async () => {
  const c = pricingConfig();
  return {
    model: c.contactModel,
    paidChatEnabled: c.paidChatEnabled,
    boostsEnabled: c.boostsEnabled,
    fastTrackEnabled: c.fastTrackEnabled,
    freeContacts: c.freeContacts,
    weekly: c.passes.WEEKLY.priceInr,
    monthly: c.passes.MONTHLY.priceInr,
    squadPerMember: c.passes.SQUAD.priceInr,
    squadDays: c.passes.SQUAD.days,
    noReplyHours: c.noReplyHours,
    boost: c.boostInr,
    boostDays: c.boostDays,
    fastTrack: c.fastTrackInr,
    successFeeEnabled: c.successFeeEnabled,
    successFeeTenant: c.successFeeTenantInr,
    successFeeOwner: c.successFeeOwnerInr,
    legacyFee: c.contactFeeInr,
    refundPromise: REFUND_PROMISE,
  };
});

export const myContactSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => contactSummary(await getSql(), context.userId));

export const startPassCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const code = rec(input).code;
    if (code !== "WEEKLY" && code !== "MONTHLY") throw new Error("Pick the weekly or monthly pass.");
    return { code: code as "WEEKLY" | "MONTHLY" };
  })
  .handler(async ({ context, data }) => {
    const cfg = pricingConfig();
    if (cfg.contactModel !== "FREE_THEN_PASS" || !cfg.passesEnabled) throw new Error("Passes are not on sale right now.");
    const sql = await getSql();
    const other = await sql`select 1 from payments where user_id = ${context.userId} and kind = 'PASS' and pass_code <> ${data.code} and status in ('PENDING','SUBMITTED')`;
    if (other.length) {
      // Switching plan before paying: drop the unpaid one.
      await sql`delete from payments where user_id = ${context.userId} and kind = 'PASS' and status = 'PENDING' and pass_code <> ${data.code}`;
      const still = await sql`select 1 from payments where user_id = ${context.userId} and kind = 'PASS' and status = 'SUBMITTED'`;
      if (still.length) throw new Error("Your earlier pass payment is being checked. Wait for it first.");
    }
    const plan = cfg.passes[data.code];
    return upiCheckout(sql, context.userId, { kind: "PASS", passCode: data.code, amount: plan.priceInr, purpose: `${plan.name} (${plan.days} days)`, label: `the ${plan.name.toLowerCase()} (${plan.days} days)` });
  });

export const getHostExtras = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const cfg = pricingConfig();
    const prof = await sql<{ fast: boolean; verified: boolean }>`select fast_track_at is not null as fast, identity_status = 'VERIFIED' as verified from profiles where user_id = ${context.userId}`;
    const pend = await sql<{ kind: string; listing_id: string | null; status: string; ref: string }>`select kind, listing_id, status, ref from payments
      where user_id = ${context.userId} and kind in ('BOOST','FASTTRACK') and status in ('PENDING','SUBMITTED')`;
    const listings = await sql<{ id: string; title: string; status: string; b: string | null }>`select id, title, status, case when boosted_until > now() then boosted_until::text end as b
      from listings where owner_id = ${context.userId} and status <> 'REMOVED' order by created_at desc limit 20`;
    return {
      boostsEnabled: cfg.boostsEnabled,
      fastTrackEnabled: cfg.fastTrackEnabled,
      boostInr: cfg.boostInr,
      boostDays: cfg.boostDays,
      fastTrackInr: cfg.fastTrackInr,
      fastTrack: Boolean(prof[0]?.fast),
      verified: Boolean(prof[0]?.verified),
      fastTrackPending: pend.find((p) => p.kind === "FASTTRACK")?.status ?? "",
      listings: listings.map((l) => ({
        id: str(l.id),
        title: str(l.title),
        status: str(l.status),
        boostedUntil: str(l.b),
        pending: pend.find((p) => p.kind === "BOOST" && p.listing_id === l.id)?.status ?? "",
      })),
    };
  });

export const startBoostCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ listingId: key(rec(input).listingId, "room") }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const cfg = pricingConfig();
    if (!cfg.boostsEnabled) throw new Error("Boosts are parked for now. Every listing gets the same shot, free.");
    const l = await sql<{ title: string; status: string }>`select title, status from listings where id = ${data.listingId} and owner_id = ${context.userId}`;
    if (!l[0]) throw new Error("Only the owner can boost this listing.");
    if (l[0].status !== "ACTIVE") throw new Error("Publish the listing before boosting it.");
    return upiCheckout(sql, context.userId, { kind: "BOOST", listingId: data.listingId, amount: cfg.boostInr, purpose: `Boost ${cfg.boostDays} days: ${l[0].title}`, label: `a ${cfg.boostDays} day boost` });
  });

export const startFastTrackCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const cfg = pricingConfig();
    if (!cfg.fastTrackEnabled) throw new Error("Fast track is parked for now. ID checks are free and in one queue.");
    const p = await sql<{ fast: boolean; verified: boolean }>`select fast_track_at is not null as fast, identity_status = 'VERIFIED' as verified from profiles where user_id = ${context.userId}`;
    if (!p[0]) throw new Error("Finish your profile first.");
    if (p[0].verified) throw new Error("Your ID is already verified.");
    if (p[0].fast) throw new Error("Fast track is already on.");
    return upiCheckout(sql, context.userId, { kind: "FASTTRACK", amount: cfg.fastTrackInr, purpose: "Fast track ID verification", label: "fast track verification" });
  });

// ---------------------------------------------------------------- move in

export const myMoveIns = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const cfg = pricingConfig();
    const rows = await sql<Record<string, unknown>>`select m.application_id, m.listing_id, m.seeker_id, m.owner_id, m.seeker_confirmed_at is not null as s_ok,
        m.owner_confirmed_at is not null as o_ok, m.confirmed_at is not null as done,
        (select status from payments p where p.kind = 'SUCCESS_FEE' and p.listing_id = m.listing_id and p.user_id = ${context.userId} and m.confirmed_at is not null and p.created_at >= m.confirmed_at order by created_at desc limit 1) as fee_status
      from move_ins m where m.seeker_id = ${context.userId} or m.owner_id = ${context.userId}`;
    return {
      successFeeEnabled: cfg.successFeeEnabled,
      tenantFee: cfg.successFeeTenantInr,
      ownerFee: cfg.successFeeOwnerInr,
      items: rows.map((r) => ({
        applicationId: str(r.application_id),
        seekerConfirmed: Boolean(r.s_ok),
        ownerConfirmed: Boolean(r.o_ok),
        confirmed: Boolean(r.done),
        feeStatus: str(r.fee_status),
      })),
    };
  });

/** Both sides click "Confirm move in" on an accepted request. */
export const confirmMoveIn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ applicationId: key(rec(input).applicationId, "request") }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const a = await sql<{ listing_id: string; seeker_id: string; host_id: string; status: string }>`select listing_id, seeker_id, host_id, status from applications where id = ${data.applicationId}`;
    const app = a[0];
    if (!app || (app.seeker_id !== context.userId && app.host_id !== context.userId)) throw new Error("Request not found.");
    if (app.status !== "ACCEPTED") throw new Error("The owner has to accept the request first.");
    await sql`insert into move_ins (id, application_id, listing_id, seeker_id, owner_id) values (${crypto.randomUUID()}, ${data.applicationId}, ${app.listing_id}, ${app.seeker_id}, ${app.host_id}) on conflict (application_id) do nothing`;
    if (context.userId === app.seeker_id)
      await sql`update move_ins set seeker_confirmed_at = coalesce(seeker_confirmed_at, now()) where application_id = ${data.applicationId}`;
    else await sql`update move_ins set owner_confirmed_at = coalesce(owner_confirmed_at, now()) where application_id = ${data.applicationId}`;
    const m = (await sql<{ s: string | null; o: string | null; c: string | null }>`select seeker_confirmed_at::text as s, owner_confirmed_at::text as o, confirmed_at::text as c from move_ins where application_id = ${data.applicationId}`)[0];
    const both = moveInConfirmed({ seekerAt: m?.s, ownerAt: m?.o });
    if (both && !m?.c) {
      await sql`update move_ins set confirmed_at = now() where application_id = ${data.applicationId} and confirmed_at is null`;
      const other = context.userId === app.seeker_id ? app.host_id : app.seeker_id;
      await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${other}, 'application', 'Move in confirmed', 'Both of you confirmed the move in. Welcome home.', '/applications')`;
    }
    return { confirmed: both };
  });

export const startSuccessFeeCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ applicationId: key(rec(input).applicationId, "request") }))
  .handler(async ({ context, data }) => {
    const cfg = pricingConfig();
    if (!cfg.successFeeEnabled) throw new Error("There is no move in fee right now.");
    // The fee is now triggered by the signed deal agreement (agreement-api startAgreementFee).
    if (cfg.successFeeEnabled) throw new Error("Sign the Roomeo agreement first. The fee is paid from there.");
    const sql = await getSql();
    const m = await sql<{ listing_id: string; seeker_id: string; owner_id: string; confirmed_at: string | null }>`select listing_id, seeker_id, owner_id, confirmed_at::text as confirmed_at from move_ins where application_id = ${data.applicationId}`;
    if (!m[0] || (m[0].seeker_id !== context.userId && m[0].owner_id !== context.userId)) throw new Error("Move in not found.");
    if (!m[0].confirmed_at) throw new Error("Both sides confirm the move in first.");
    const tenant = m[0].seeker_id === context.userId;
    const amount = tenant ? cfg.successFeeTenantInr : cfg.successFeeOwnerInr;
    if (amount <= 0) throw new Error("There is no move in fee for you.");
    // Once per deal per person: only a fee paid after THIS move in was confirmed counts.
    const paid = await sql`select 1 from payments where kind = 'SUCCESS_FEE' and listing_id = ${m[0].listing_id} and user_id = ${context.userId} and status = 'PAID' and created_at >= ${m[0].confirmed_at}::timestamptz`;
    if (paid.length) throw new Error("Already paid. Thanks.");
    return upiCheckout(sql, context.userId, { kind: "SUCCESS_FEE", listingId: m[0].listing_id, amount, purpose: `Success fee, one time (${tenant ? "tenant" : "owner"})`, label: "the one-time success fee" });
  });

// ---------------------------------------------------------------- admin

export const adminRunSweep = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const r = await runPricingSweep(sql);
    await audit(sql, context.userId, "pricing.sweep", "system", "pricing", JSON.stringify(r));
    return r;
  });

export const adminRevenue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const d = Number(rec(input).days);
    return { days: [7, 30, 90, 365].includes(d) ? d : 30 };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const d = data.days;
    const one = async (q: string) => num((await sql.query<{ n: number }>(q, [d]))[0]?.n);
    const since = `now() - make_interval(days => $1)`;
    const revenue = await sql.query<{ kind: string; pass_code: string | null; n: number; inr: number }>(
      `select kind, pass_code, count(*)::int as n, coalesce(sum(amount_inr), 0)::int as inr from payments
       where provider = 'UPI' and status in ('PAID','REFUND_DUE','REFUNDED') and coalesce(reviewed_at, created_at) > ${since} group by kind, pass_code`,
      [d],
    );
    const refunded = await sql.query<{ inr: number; n: number }>(
      `select coalesce(sum(amount_inr), 0)::int as inr, count(*)::int as n from payments where status in ('REFUND_DUE','REFUNDED') and coalesce(refund_due_at, created_at) > ${since}`,
      [d],
    );
    const label = (k: string, c: string | null) =>
      k === "PASS" ? (c === "MONTHLY" ? "Monthly pass" : "Weekly pass") : k === "CONTACT" ? (c === "SQUAD" ? "Squad pass" : "Contact fee (old)") : k === "BOOST" ? "Host boost" : k === "FASTTRACK" ? "Fast track" : k === "SUCCESS_FEE" ? "Move in fee" : "Plans";
    const byType = new Map<string, { label: string; count: number; inr: number }>();
    for (const r of revenue) {
      const l = label(r.kind, r.pass_code);
      const cur = byType.get(l) ?? { label: l, count: 0, inr: 0 };
      cur.count += num(r.n);
      cur.inr += num(r.inr);
      byType.set(l, cur);
    }
    const gross = [...byType.values()].reduce((a, b) => a + b.inr, 0);
    const refundInr = num(refunded[0]?.inr);
    return {
      days: d,
      signups: await one(`select count(*)::int as n from profiles where is_demo = false and created_at > ${since}`),
      contactStarts: await one(`select count(*)::int as n from contact_unlocks where created_at > ${since}`),
      freeContacts: await one(`select count(*)::int as n from contact_unlocks where source = 'FREE' and created_at > ${since}`),
      noReply: await one(`select count(*)::int as n from contact_unlocks where outcome = 'NO_REPLY' and created_at > ${since}`),
      declined: await one(`select count(*)::int as n from contact_unlocks where outcome = 'DECLINED' and created_at > ${since}`),
      passesSold: await one(`select count(*)::int as n from contact_passes where created_at > ${since}`),
      activePasses: await one(`select count(*)::int as n from contact_passes where status = 'ACTIVE' and ends_at > now() and $1 > 0`),
      boosts: await one(`select count(*)::int as n from payments where kind = 'BOOST' and status = 'PAID' and coalesce(reviewed_at, created_at) > ${since}`),
      fastTracks: await one(`select count(*)::int as n from payments where kind = 'FASTTRACK' and status = 'PAID' and coalesce(reviewed_at, created_at) > ${since}`),
      moveIns: await one(`select ((select count(*) from move_ins where confirmed_at > ${since}) + (select count(*) from squad_move_ins where confirmed_at > ${since}))::int as n`),
      grossInr: gross,
      refundInr,
      netInr: gross - refundInr,
      refundPct: gross > 0 ? Math.round((refundInr / gross) * 1000) / 10 : 0,
      byType: [...byType.values()].sort((a, b) => b.inr - a.inr),
      config: (() => {
        const c = pricingConfig();
        return { model: c.contactModel, freeContacts: c.freeContacts, passesEnabled: c.passesEnabled, successFeeEnabled: c.successFeeEnabled };
      })(),
    };
  });
