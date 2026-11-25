// Booking funnel: the server-side event log, the admin funnel counts and the 2-hour owner nudge (25 Nov 2026).
// Pure SQL with relative imports so node tests can run it. Every function tolerates migration 0034 not being applied
// (prod until approved): logging and nudges are skipped, and the admin counts come from DB state alone.
import type { Sql } from "../db.ts";
import { withSavepoint } from "../tx.ts";
import { isMissingTable } from "./referrals.ts";
import { mappstoreConfig, notifyWhatsApp, whatsappNotifyEnabled, NOTIFY_EVENTS } from "./mappstore.ts";
import { logEvent } from "./services.ts";
import { FUNNEL_LABELS, FUNNEL_SOURCES, nudgeBedLabel, nudgeHoldReason, type FunnelStep, type FunnelStepKey, type FunnelWindow } from "./funnel-steps.ts";
export { stepRate } from "./funnel-steps.ts";

export const SERVER_FUNNEL_KINDS = ["request_submitted", "owner_responded", "request_accepted", "payment_completed", "moved_in"] as const;
export type ServerFunnelKind = (typeof SERVER_FUNNEL_KINDS)[number];
/**
 * Steps that happen with nobody's browser on the page (an admin approves a UPI payment; the second side confirms a
 * move-in from a signed link). They're logged here and the affected person's own browser sends them to GA4 once.
 */
export const HANDOFF_KINDS = ["payment_completed", "moved_in"] as const satisfies readonly ServerFunnelKind[];

/** Payments that count as "payment completed" in the booking funnel: the per-listing contact fee and the ₹499 success fee. */
export const FUNNEL_PAYMENT_KINDS = ["CONTACT", "SUCCESS_FEE"] as const;

export type FunnelTables = { events: boolean; nudges: boolean };

export async function funnelTables(sql: Sql): Promise<FunnelTables> {
  try {
    const r = (await sql.query<{ e: boolean; n: boolean }>(
      `select to_regclass('public.funnel_events') is not null as e, to_regclass('public.owner_nudges') is not null as n`,
    ))[0];
    return { events: Boolean(r?.e), nudges: Boolean(r?.n) };
  } catch {
    return { events: false, nudges: false };
  }
}

export type FunnelRecord = { kind: ServerFunnelKind; refId: string; listingId?: string | null; city?: string | null; userId?: string | null };
export type RecordResult = "saved" | "duplicate" | "no_table" | "failed";

/**
 * Log one server-side funnel step. Idempotent per (kind, ref): a repeat is "duplicate". Never throws, and inside a
 * transaction it runs under a savepoint so a failure can't abort the caller's work.
 */
export async function recordFunnelEvent(sql: Sql, ev: FunnelRecord): Promise<RecordResult> {
  if (!(SERVER_FUNNEL_KINDS as readonly string[]).includes(ev.kind) || !ev.refId) return "failed";
  try {
    if (!(await funnelTables(sql)).events) return "no_table";
    const listingId = ev.listingId || null;
    let city = String(ev.city ?? "").trim().slice(0, 60);
    if (!city && listingId) city = String((await sql<{ c: string }>`select city_name as c from listings where id = ${listingId}`)[0]?.c ?? "").slice(0, 60);
    const rows = await withSavepoint(sql, (tx) =>
      tx.query<{ id: string }>(
        `insert into funnel_events (id, kind, ref_id, listing_id, city, user_id) values ($1, $2, $3, $4, $5, $6)
         on conflict (kind, ref_id) do nothing returning id`,
        [crypto.randomUUID(), ev.kind, ev.refId, listingId, city, ev.userId || null],
      ),
    );
    if (rows.length) logEvent(`funnel.${ev.kind}`, { city, listing: Boolean(listingId) });
    return rows.length ? "saved" : "duplicate";
  } catch (err) {
    console.warn("[funnel] log skipped", isMissingTable(err) ? "(migration 0034 not applied)" : String(err).slice(0, 160));
    return isMissingTable(err) ? "no_table" : "failed";
  }
}

/** After a payment is PAID: log payment_completed if it is a funnel payment (contact fee / success fee). */
export async function recordPaymentCompleted(sql: Sql, paymentId: string): Promise<RecordResult> {
  try {
    const p = (await sql.query<{ user_id: string; listing_id: string | null; kind: string }>(
      `select user_id, listing_id, kind from payments where id = $1 and status = 'PAID'`,
      [paymentId],
    ))[0];
    if (!p || !(FUNNEL_PAYMENT_KINDS as readonly string[]).includes(p.kind)) return "failed";
    return recordFunnelEvent(sql, { kind: "payment_completed", refId: paymentId, listingId: p.listing_id, userId: p.user_id });
  } catch {
    return "failed";
  }
}

/** The person's own server-logged steps from the last 14 days, for their browser to send to GA4 once. */
export async function handoffEventsFor(sql: Sql, userId: string): Promise<Array<{ id: string; kind: string; listingId: string; city: string }>> {
  try {
    if (!userId || !(await funnelTables(sql)).events) return [];
    const rows = await sql.query<{ id: string; kind: string; listing_id: string | null; city: string }>(
      `select id, kind, listing_id, city from funnel_events where user_id = $1 and kind = any($2::text[]) and created_at > now() - interval '14 days'
       order by created_at asc limit 20`,
      [userId, [...HANDOFF_KINDS]],
    );
    return rows.map((r) => ({ id: r.id, kind: r.kind, listingId: r.listing_id ?? "", city: r.city ?? "" }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- admin funnel

const ORDER: FunnelStepKey[] = ["search", "listing_view", "request_submitted", "owner_responded", "request_accepted", "payment_completed", "moved_in", "whatsapp_click"];

/** Step counts for the last `days` days. Works with or without migration 0034. */
export async function funnelCounts(sql: Sql, days: 7 | 30, tables?: FunnelTables): Promise<FunnelWindow> {
  const t = tables ?? (await funnelTables(sql));
  const since = `now() - interval '${days === 30 ? 30 : 7} days'`;
  const r = (await sql.query<Record<string, number>>(`select
      (select count(*)::int from metric_events where kind = 'search' and created_at > ${since}) as search,
      (select count(*)::int from applications a join listings l on l.id = a.listing_id
         where l.is_demo = false and a.created_at > ${since}) as request_submitted,
      (select count(*)::int from applications a join listings l on l.id = a.listing_id
         where l.is_demo = false and a.status in ('ACCEPTED', 'DECLINED') and a.updated_at > ${since}) as owner_responded,
      (select count(*)::int from applications a join listings l on l.id = a.listing_id
         where l.is_demo = false and a.updated_at > ${since}
           and (a.status = 'ACCEPTED' or exists (select 1 from move_ins m where m.application_id = a.id))) as request_accepted,
      (select count(*)::int from payments where kind = any($1::text[]) and status in ('PAID', 'REFUND_DUE', 'REFUNDED')
         and coalesce(reviewed_at, created_at) > ${since}) as payment_completed,
      ((select count(*) from move_ins where confirmed_at > ${since}) + (select count(*) from squad_move_ins where confirmed_at > ${since}))::int as moved_in`,
    [[...FUNNEL_PAYMENT_KINDS]]))[0] ?? {};
  const logged = new Map<string, number>();
  if (t.events) {
    try {
      for (const row of await sql.query<{ kind: string; n: number }>(`select kind, count(*)::int as n from funnel_events where created_at > ${since} group by kind`))
        logged.set(row.kind, Number(row.n));
    } catch {
      /* log unreadable: DB state still shows */
    }
  }
  const steps = ORDER.map((key): FunnelStep => {
    const gaOnly = key === "listing_view" || key === "whatsapp_click";
    const isLogged = (SERVER_FUNNEL_KINDS as readonly string[]).includes(key);
    return {
      key,
      label: FUNNEL_LABELS[key],
      count: gaOnly ? null : Number(r[key] ?? 0),
      logged: t.events && isLogged ? (logged.get(key) ?? 0) : null,
      source: FUNNEL_SOURCES[key],
    };
  });
  return { days, steps };
}

// ---------------------------------------------------------------- owner nudge

export const NUDGE_AFTER_HOURS = 2;
/** Requests older than this are not nudged (the reminder would be stale). */
export const NUDGE_MAX_AGE_HOURS = 72;

type Env = Record<string, string | undefined>;
export type NudgeSender = (phoneE164: string, params: string[]) => Promise<"sent" | "skipped" | "failed">;
export type NudgeRun = { ready: boolean; enabled: boolean; due: number; held: number; sent: number; failed: number; skipped: number };

/**
 * One pass of the owner nudge. A request still PENDING after 2 hours (and under 72 hours old, not a demo bed) gets at
 * most ONE WhatsApp reminder, ever: owner_nudges has one row per request. While MAPPSTORE_NOTIFY_ENABLED / the template
 * / the owner's verified phone are missing, the nudge is logged as HELD and nothing is sent; a later pass may send a
 * HELD nudge once (HELD -> SENDING is a single conditional update, so two passes can't both send).
 */
export async function runOwnerNudges(sql: Sql, opts: { env?: Env; send?: NudgeSender; limit?: number } = {}): Promise<NudgeRun> {
  const env = opts.env ?? (typeof process !== "undefined" ? (process.env as Env) : {});
  const out: NudgeRun = { ready: false, enabled: false, due: 0, held: 0, sent: 0, failed: 0, skipped: 0 };
  const t = await funnelTables(sql);
  if (!t.nudges) {
    logEvent("nudge.skipped", { reason: "migration 0034 not applied" });
    return out;
  }
  out.ready = true;
  const flagOn = whatsappNotifyEnabled(env);
  const templateSet = Boolean(env[NOTIFY_EVENTS.ownerNudge]?.trim());
  const apiKeySet = Boolean(mappstoreConfig(env));
  out.enabled = flagOn && templateSet && apiKeySet;
  const send: NudgeSender = opts.send ?? ((phone, params) => notifyWhatsApp("ownerNudge", phone, params, env));
  const due = await sql.query<{ id: string; host_id: string; listing_id: string; title: string; phone: string | null }>(
    `select a.id, a.host_id, a.listing_id, l.title,
            (select p.phone_e164 from profiles p where p.user_id = a.host_id and p.phone_verified_at is not null) as phone
     from applications a
     join listings l on l.id = a.listing_id
     join profiles h on h.user_id = a.host_id
     where a.status = 'PENDING'
       and a.created_at <= now() - interval '${NUDGE_AFTER_HOURS} hours'
       and a.created_at > now() - interval '${NUDGE_MAX_AGE_HOURS} hours'
       and l.is_demo = false and coalesce(h.is_demo, false) = false
       and not exists (select 1 from owner_nudges n where n.application_id = a.id and n.status <> 'HELD')
     order by a.created_at asc
     limit $1`,
    [Math.min(500, Math.max(1, opts.limit ?? 200))],
  );
  out.due = due.length;
  for (const a of due) {
    const reason = nudgeHoldReason({ flagOn, templateSet, apiKeySet, ownerPhone: a.phone });
    if (reason) {
      await sql.query(
        `insert into owner_nudges (application_id, owner_id, listing_id, status, reason) values ($1, $2, $3, 'HELD', $4)
         on conflict (application_id) do update set reason = excluded.reason, updated_at = now() where owner_nudges.status = 'HELD'`,
        [a.id, a.host_id, a.listing_id, reason],
      );
      out.held++;
      logEvent("nudge.held", { reason });
      continue;
    }
    const claimed = await sql.query<{ application_id: string }>(
      `insert into owner_nudges (application_id, owner_id, listing_id, status, reason) values ($1, $2, $3, 'SENDING', '')
       on conflict (application_id) do update set status = 'SENDING', reason = '', updated_at = now() where owner_nudges.status = 'HELD'
       returning application_id`,
      [a.id, a.host_id, a.listing_id],
    );
    if (!claimed.length) continue; // another pass got it
    let result: "sent" | "skipped" | "failed" = "failed";
    try {
      result = await send(String(a.phone), [nudgeBedLabel(a.title)]);
    } catch {
      result = "failed";
    }
    const status = result === "sent" ? "SENT" : result === "skipped" ? "SKIPPED" : "FAILED";
    await sql.query(
      `update owner_nudges set status = $2, reason = $3, updated_at = now(), sent_at = case when $2 = 'SENT' then now() else null end where application_id = $1`,
      [a.id, status, result === "sent" ? "" : `send ${result}`],
    );
    if (result === "sent") out.sent++;
    else if (result === "skipped") out.skipped++;
    else out.failed++;
    logEvent("nudge.sent", { result });
  }
  return out;
}

/** Nudge log counts for the admin funnel page (null while the table is missing). */
export async function nudgeCounts(sql: Sql, days: 7 | 30, tables?: FunnelTables): Promise<Record<string, number> | null> {
  const t = tables ?? (await funnelTables(sql));
  if (!t.nudges) return null;
  try {
    const rows = await sql.query<{ status: string; n: number }>(
      `select status, count(*)::int as n from owner_nudges where created_at > now() - interval '${days === 30 ? 30 : 7} days' group by status`,
    );
    const out: Record<string, number> = { HELD: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
    for (const r of rows) out[r.status] = Number(r.n);
    return out;
  } catch {
    return null;
  }
}
