import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { SITE_URL } from "@/lib/seo";
import { isMissingTable } from "@/lib/roomsetu/referrals";
import { buildUpiLink, makeRef, upiPayee, utrSchema } from "@/lib/roomsetu/upi";
import { cashfreeClient, cashfreeConfig } from "@/lib/roomsetu/cashfree";
import { listingRentBadge } from "@/lib/roomsetu/rent-autopay-db";
import { UPI_AUTOPAY_NO_PIN_LIMIT_INR, istToday, monthOf, nextDueDate, rentAutopayEnabled, subscriptionIdFor } from "@/lib/roomsetu/rent-autopay";

const OFF = { enabled: false as const };
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const id = (v: unknown) => {
  if (typeof v !== "string" || !/^[0-9a-zA-Z-]{8,80}$/.test(v)) throw new Error("Unknown rent plan.");
  return v;
};

function assertOn() {
  if (!rentAutopayEnabled()) throw new Error("Rent AutoPay isn't live yet.");
}

/** Renter + owner view of rent for the dashboard. `enabled: false` hides everything (flag off or migration 0018 not applied). */
export const getRentAutopay = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!rentAutopayEnabled()) return OFF;
    try {
      const sql = await getSql();
      const month = monthOf(istToday(new Date()));
      const mine = await sql<{ id: string; title: string; bed_label: string; amount_inr: number; due_day: number; mandate_status: string | null; entry_status: string | null; entry_source: string | null }>`
        select p.id, l.title, p.bed_label, p.amount_inr, p.due_day,
          (select status from rent_mandates m where m.plan_id = p.id order by created_at desc limit 1) as mandate_status,
          e.status as entry_status, e.source as entry_source
        from rent_plans p join listings l on l.id = p.listing_id
        left join rent_entries e on e.plan_id = p.id and e.month = ${month}
        where p.renter_id = ${context.userId} and p.status = 'ACTIVE' order by p.created_at`;
      const beds = await sql<{ id: string; title: string; bed_label: string; renter: string; amount_inr: number; due_day: number; mandate_status: string | null; entry_status: string | null; entry_source: string | null; provider_ref: string | null }>`
        select p.id, l.title, p.bed_label, coalesce(u.name, 'Renter') as renter, p.amount_inr, p.due_day,
          (select status from rent_mandates m where m.plan_id = p.id order by created_at desc limit 1) as mandate_status,
          e.status as entry_status, e.source as entry_source, e.provider_ref
        from rent_plans p join listings l on l.id = p.listing_id
        left join "user" u on u.id = p.renter_id
        left join rent_entries e on e.plan_id = p.id and e.month = ${month}
        where p.owner_id = ${context.userId} and p.status = 'ACTIVE' order by l.title, p.bed_label`;
      const candidates = await sql<{ id: string; title: string; renter: string; rent: number }>`
        select mi.id, l.title, coalesce(u.name, 'Renter') as renter, l.monthly_rent as rent
        from move_ins mi join listings l on l.id = mi.listing_id left join "user" u on u.id = mi.seeker_id
        where mi.owner_id = ${context.userId} and mi.confirmed_at is not null
          and not exists (select 1 from rent_plans p where p.move_in_id = mi.id) order by mi.confirmed_at desc limit 20`;
      return {
        enabled: true as const,
        month,
        autopayReady: Boolean(cashfreeConfig()),
        noPinLimit: UPI_AUTOPAY_NO_PIN_LIMIT_INR,
        mine: mine.map((r) => ({ ...r, amount_inr: Number(r.amount_inr), due_day: Number(r.due_day), nextDue: nextDueDate(istToday(new Date()), Number(r.due_day)) })),
        beds: beds.map((r) => ({ ...r, amount_inr: Number(r.amount_inr), due_day: Number(r.due_day), utr: r.entry_source === "upi_manual" ? r.provider_ref : null })),
        candidates: candidates.map((c) => ({ ...c, rent: Number(c.rent) })),
      };
    } catch (err) {
      if (isMissingTable(err)) return OFF;
      throw err;
    }
  });

/** Owner turns a confirmed move-in into a monthly rent plan. */
export const createRentPlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    const dueDay = Number(o.dueDay);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) throw new Error("Pick a due day from 1 to 28.");
    const amount = o.amountInr == null || o.amountInr === "" ? null : Number(o.amountInr);
    if (amount !== null && (!Number.isInteger(amount) || amount < 100 || amount > 200_000)) throw new Error("Rent should be ₹100 to ₹2,00,000.");
    return { moveInId: id(o.moveInId), dueDay, amountInr: amount, bedLabel: typeof o.bedLabel === "string" ? o.bedLabel.trim().slice(0, 40) : "" };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    const sql = await getSql();
    const mi = (await sql<{ listing_id: string; seeker_id: string; owner_id: string; rent: number }>`
      select mi.listing_id, mi.seeker_id, mi.owner_id, l.monthly_rent as rent from move_ins mi join listings l on l.id = mi.listing_id
      where mi.id = ${data.moveInId} and mi.confirmed_at is not null`)[0];
    if (!mi || mi.owner_id !== context.userId) throw new Error("Only the owner can set up rent for this move-in.");
    await sql`insert into rent_plans (id, listing_id, bed_label, move_in_id, renter_id, owner_id, amount_inr, due_day)
      values (${crypto.randomUUID()}, ${mi.listing_id}, ${data.bedLabel}, ${data.moveInId}, ${mi.seeker_id}, ${mi.owner_id}, ${data.amountInr ?? Number(mi.rent)}, ${data.dueDay})
      on conflict (move_in_id) do nothing`;
    return { ok: true, message: "Rent plan's set ✨ Your renter can switch on AutoPay now." };
  });

async function renterPlan(sql: Sql, planId: string, userId: string) {
  const p = (await sql<{ id: string; renter_id: string; amount_inr: number; due_day: number; title: string }>`
    select p.id, p.renter_id, p.amount_inr, p.due_day, l.title from rent_plans p join listings l on l.id = p.listing_id where p.id = ${planId} and p.status = 'ACTIVE'`)[0];
  if (!p || p.renter_id !== userId) throw new Error("That rent plan isn't yours.");
  return p;
}

/** Renter: create the UPI AutoPay mandate. Returns the Cashfree session to open checkout (they approve once in their UPI app). */
export const startRentAutopay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ planId: id(rec(input).planId) }))
  .handler(async ({ context, data }) => {
    assertOn();
    const cfg = cashfreeConfig();
    if (!cfg) throw new Error("AutoPay is still being set up on our side. Use the UPI link for now 🙏");
    const sql = await getSql();
    const plan = await renterPlan(sql, data.planId, context.userId);
    const active = (await sql<{ status: string }>`select status from rent_mandates where plan_id = ${plan.id} and status in ('ACTIVE','BANK_APPROVAL_PENDING')`)[0];
    if (active) throw new Error("AutoPay is already on for this bed 🙌");
    const user = (await sql<{ name: string; email: string; phone: string | null }>`
      select u.name, u.email, pr.phone_e164 as phone from "user" u left join profiles pr on pr.user_id = u.id where u.id = ${context.userId}`)[0];
    if (!user?.phone) throw new Error("Add and verify your phone number first, UPI AutoPay needs it.");
    const n = Number((await sql<{ n: number }>`select count(*)::int as n from rent_mandates where plan_id = ${plan.id}`)[0]?.n ?? 0) + 1;
    const subscriptionId = subscriptionIdFor(plan.id, n);
    const created = await cashfreeClient(cfg).createSubscription({
      subscriptionId,
      planName: `Rent ${plan.title}`,
      maxAmountInr: Number(plan.amount_inr),
      customer: { name: user.name, email: user.email, phone: user.phone },
      returnUrl: `${SITE_URL}/dashboard?autopay=${encodeURIComponent(subscriptionId)}`,
    });
    await sql`insert into rent_mandates (id, plan_id, subscription_id, cf_subscription_id, status, max_amount_inr)
      values (${crypto.randomUUID()}, ${plan.id}, ${subscriptionId}, ${created.cfSubscriptionId}, ${created.status}, ${Number(plan.amount_inr)})`;
    return { sessionId: created.sessionId, mode: cfg.env };
  });

/** Renter fallback: plain UPI link to the PG's UPI ID, then they paste the 12-digit UTR. */
export const startRentUpi = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ planId: id(rec(input).planId) }))
  .handler(async ({ context, data }) => {
    assertOn();
    const payee = upiPayee();
    if (!payee.ready) throw new Error("The PG's UPI ID isn't set yet.");
    const sql = await getSql();
    const plan = await renterPlan(sql, data.planId, context.userId);
    const today = istToday(new Date());
    const due = nextDueDate(today, Number(plan.due_day));
    const month = monthOf(due);
    const ref = makeRef();
    const link = buildUpiLink({ vpa: payee.vpa, name: payee.name, amountInr: Number(plan.amount_inr), ref });
    return { link, ref, amount: Number(plan.amount_inr), payee: payee.name, vpa: payee.vpa, month, due };
  });

export const submitRentUtr = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    const utr = utrSchema.safeParse(o.utr);
    if (!utr.success) throw new Error("Enter the 12-digit UTR from your UPI app.");
    const month = typeof o.month === "string" && /^\d{4}-\d{2}$/.test(o.month) ? o.month : null;
    if (!month) throw new Error("Unknown month.");
    return { planId: id(o.planId), utr: utr.data, month };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    const sql = await getSql();
    const plan = await renterPlan(sql, data.planId, context.userId);
    const due = `${data.month}-${String(plan.due_day).padStart(2, "0")}`;
    await sql`insert into rent_entries (id, plan_id, month, due_date, amount_inr, status, source, provider_ref)
      values (${crypto.randomUUID()}, ${plan.id}, ${data.month}, ${due}::date, ${Number(plan.amount_inr)}, 'PENDING', 'upi_manual', ${data.utr})
      on conflict (plan_id, month) do update set source = 'upi_manual', provider_ref = ${data.utr}, updated_at = now() where rent_entries.status <> 'PAID'`;
    return { ok: true, message: "UTR sent ✅ The owner confirms it once it lands." };
  });

/** Owner confirms a manual UPI payment. Counts as paid, but not toward the badge (not provider-confirmed). */
export const confirmRentUtr = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ planId: id(rec(input).planId) }))
  .handler(async ({ context, data }) => {
    assertOn();
    const sql = await getSql();
    const month = monthOf(istToday(new Date()));
    const r = await sql<{ id: string }>`update rent_entries e set status = 'PAID', paid_at = now(), updated_at = now()
      from rent_plans p where p.id = e.plan_id and p.id = ${data.planId} and p.owner_id = ${context.userId}
        and e.month = ${month} and e.source = 'upi_manual' and e.status <> 'PAID' returning e.id`;
    if (!r.length) throw new Error("Nothing to confirm for this bed.");
    return { ok: true };
  });

/** Public: on-time badge for a listing, from provider-confirmed AutoPay entries only. */
export const getListingRentBadge = createServerFn({ method: "GET" })
  .validator((input: unknown) => id(input))
  .handler(async ({ data }) => {
    if (!rentAutopayEnabled()) return null;
    try {
      return await listingRentBadge(await getSql(), data, new Date());
    } catch (err) {
      if (isMissingTable(err)) return null;
      throw err;
    }
  });
