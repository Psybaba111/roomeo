/** Rent AutoPay DB work shared by the webhook, the cron and the server functions. Every function takes `sql` so tests can use PGlite. */
import type { Sql } from "../db.ts";
import {
  RENT_TEMPLATES,
  addDays,
  istToday,
  monthOf,
  onTimeBadge,
  paymentIdFor,
  planAction,
  type CashfreeEvent,
} from "./rent-autopay.ts";

type Charger = { raiseCharge(p: { subscriptionId: string; paymentId: string; amountInr: number; scheduleDate: string; remarks: string }): Promise<{ cfPaymentId: string | null; status: string }> };

/** Queue a WhatsApp message (MappStore template). Only queued: nothing here sends. Deduped per key. */
export async function queueRentWhatsApp(sql: Sql, p: { dedupeKey: string; userId: string; template: string; params: string[] }): Promise<boolean> {
  const rows = await sql<{ id: string }>`insert into rent_outbox (id, dedupe_key, user_id, template, params)
    values (${crypto.randomUUID()}, ${p.dedupeKey}, ${p.userId}, ${p.template}, ${JSON.stringify(p.params)}::jsonb)
    on conflict (dedupe_key) do nothing returning id`;
  return rows.length > 0;
}

/**
 * Apply one verified Cashfree webhook. Returns "duplicate" when the event key was already processed.
 * The event log insert and the state change are idempotent on their own, so a crash between them is safe to replay.
 */
export async function applyCashfreeEvent(sql: Sql, key: string, type: string, payload: unknown, ev: CashfreeEvent): Promise<"applied" | "duplicate" | "ignored" | "unknown"> {
  const fresh = await sql<{ event_key: string }>`insert into rent_webhook_events (event_key, event_type, payload)
    values (${key}, ${type}, ${JSON.stringify(payload ?? null)}::jsonb) on conflict (event_key) do nothing returning event_key`;
  if (!fresh.length) return "duplicate";
  if (ev.kind === "ignored") return "ignored";
  if (ev.kind === "mandate") {
    const r = await sql<{ id: string }>`update rent_mandates set status = ${ev.status}, cf_subscription_id = coalesce(${ev.cfSubscriptionId}, cf_subscription_id), updated_at = now()
      where subscription_id = ${ev.subscriptionId} returning id`;
    return r.length ? "applied" : "unknown";
  }
  // Payment: never downgrade a PAID entry (late FAILED after SUCCESS is ignored).
  const paidAt = ev.at ? new Date(ev.at) : new Date();
  const r = await sql<{ id: string; plan_id: string; amount_inr: number; month: string }>`update rent_entries set
      status = case when status = 'PAID' then status else ${ev.status} end,
      cf_payment_id = coalesce(${ev.cfPaymentId}, cf_payment_id),
      paid_at = case when status = 'PAID' then paid_at when ${ev.status} = 'PAID' then ${paidAt.toISOString()}::timestamptz else paid_at end,
      provider_confirmed = provider_confirmed or ${ev.status === "PAID"},
      updated_at = now()
    where provider_ref = ${ev.paymentId} and source = 'autopay'
    returning id, plan_id, amount_inr, month`;
  const e = r[0];
  if (!e) return "unknown";
  if (ev.status === "PAID") {
    const plan = (await sql<{ renter_id: string; owner_id: string }>`select renter_id, owner_id from rent_plans where id = ${e.plan_id}`)[0];
    if (plan) {
      await queueRentWhatsApp(sql, { dedupeKey: `paid:${e.id}`, userId: plan.renter_id, template: RENT_TEMPLATES.PAID, params: ["", String(e.amount_inr), e.month] });
      await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${plan.owner_id}, 'rent', 'Rent in via AutoPay 💸', ${`₹${e.amount_inr} for ${e.month} landed.`}, '/dashboard')`;
    }
  }
  return "applied";
}

type PlanRow = {
  id: string;
  renter_id: string;
  amount_inr: number;
  due_day: number;
  subscription_id: string | null;
  mandate_status: string | null;
};
type EntryRow = { id: string; month: string; due_date: string; status: "PENDING" | "PAID" | "FAILED"; attempts: number; notified_at: unknown; charge_requested_at: unknown; fallback_link_at: unknown };

export type SweepResult = { notified: number; charged: number; fallbacks: number; errors: number };

/** The daily rent run. `charger` is the Cashfree client (mocked in tests). */
export async function runRentSweep(sql: Sql, charger: Charger | null, now: Date, payLink: (planId: string) => string): Promise<SweepResult> {
  const out: SweepResult = { notified: 0, charged: 0, fallbacks: 0, errors: 0 };
  const plans = await sql<PlanRow>`select p.id, p.renter_id, p.amount_inr, p.due_day, m.subscription_id, m.status as mandate_status
    from rent_plans p
    left join lateral (select subscription_id, status from rent_mandates where plan_id = p.id order by created_at desc limit 1) m on true
    where p.status = 'ACTIVE'`;
  const today = istToday(now);
  for (const p of plans) {
    try {
      // Chase the oldest unpaid entry first; otherwise look at the upcoming due date.
      const open = (await sql<EntryRow>`select id, month, due_date::text as due_date, status, attempts, notified_at, charge_requested_at, fallback_link_at
        from rent_entries where plan_id = ${p.id} and status <> 'PAID' and due_date >= ${addDays(today, -10)}::date order by due_date limit 1`)[0];
      const action = planAction({
        now,
        dueDay: Number(p.due_day),
        mandateActive: p.mandate_status === "ACTIVE",
        entryDueDate: open?.due_date,
        entry: open
          ? { status: open.status, attempts: Number(open.attempts), notified: Boolean(open.notified_at), chargeRequested: Boolean(open.charge_requested_at), fallbackSent: Boolean(open.fallback_link_at) }
          : null,
      });
      if (action.kind === "notify") {
        const month = monthOf(action.dueDate);
        const ins = await sql<{ id: string }>`insert into rent_entries (id, plan_id, month, due_date, amount_inr, status, source, notified_at)
          values (${crypto.randomUUID()}, ${p.id}, ${month}, ${action.dueDate}::date, ${p.amount_inr}, 'PENDING', 'autopay', now())
          on conflict (plan_id, month) do update set notified_at = coalesce(rent_entries.notified_at, now()) returning id`;
        await queueRentWhatsApp(sql, { dedupeKey: `pre:${p.id}:${month}`, userId: p.renter_id, template: RENT_TEMPLATES.PRE_DEBIT, params: ["", String(p.amount_inr), action.dueDate] });
        if (ins.length) out.notified++;
      } else if (action.kind === "charge" && open && charger && p.subscription_id) {
        const paymentId = paymentIdFor(p.id, open.month, action.attempt);
        await charger.raiseCharge({ subscriptionId: p.subscription_id, paymentId, amountInr: Number(p.amount_inr), scheduleDate: action.scheduleDate, remarks: `roomeo rent ${open.month}` });
        await sql`update rent_entries set provider_ref = ${paymentId}, attempts = ${action.attempt}, status = 'PENDING', charge_requested_at = now(), updated_at = now() where id = ${open.id}`;
        out.charged++;
      } else if (action.kind === "fallback" && open) {
        await queueRentWhatsApp(sql, { dedupeKey: `fallback:${open.id}`, userId: p.renter_id, template: RENT_TEMPLATES.FALLBACK, params: ["", String(p.amount_inr), payLink(p.id)] });
        await sql`update rent_entries set fallback_link_at = now(), updated_at = now() where id = ${open.id}`;
        out.fallbacks++;
      }
    } catch (err) {
      out.errors++;
      console.error("[rent-sweep] plan skipped", p.id, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/** Badge for a listing from provider-confirmed entries only. null hides it. */
export async function listingRentBadge(sql: Sql, listingId: string, now: Date) {
  const rows = await sql<{ month: string; due_date: string; paid_at: string | null; status: string; provider_confirmed: boolean }>`
    select e.month, e.due_date::text as due_date, e.paid_at::text as paid_at, e.status, e.provider_confirmed
    from rent_entries e join rent_plans p on p.id = e.plan_id where p.listing_id = ${listingId}`;
  return onTimeBadge(
    rows.map((r) => ({ month: r.month, dueDate: r.due_date, paidAt: r.paid_at, status: r.status, providerConfirmed: Boolean(r.provider_confirmed) })),
    now,
  );
}
