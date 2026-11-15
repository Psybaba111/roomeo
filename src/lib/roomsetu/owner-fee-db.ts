// Owner commission records. Pure SQL with relative imports so it runs under node tests (PGlite).
import type { Sql } from "../db.ts";
import { pricingConfig } from "./pricing.ts";
import {
  attributed,
  canMarkPaid,
  canRecordEarlyExit,
  canRefund50,
  commissionAmounts,
  commissionDueOn,
  defaultFoundingUntil,
  earlyExitDueInr,
  istYmd,
  ownerFeeGstPct,
  ownerFeeState,
  paymentLinkStub,
  rateFor,
  refundEligible,
  refundInr,
  squadBedRentInr,
  type CommissionStatus,
  type HostFeeSetting,
} from "./owner-fee.ts";

/** True when the owner-fee switch is on and the flat success fee is off. */
export function ownerFeeActive(): boolean {
  return ownerFeeState(pricingConfig().successFeeEnabled).active;
}

/** Missing table (migration 0027 not applied yet) — callers treat the feature as off. */
export const COMMISSION_TABLES_MISSING =
  "Owner commissions aren't set up on this database yet (migration 0027 hasn't been run). Nothing was changed.";

export type CommissionActionResult<T> = { ok: true; row: T } | { ok: false; error: string };

/**
 * Admin commission actions: if the 0027 tables are missing, answer with a friendly message instead of
 * throwing (which would surface as a 500). Any other error still throws.
 */
export async function withCommissionTables<T>(fn: () => Promise<T>): Promise<CommissionActionResult<T>> {
  try {
    return { ok: true, row: await fn() };
  } catch (err) {
    if (isMissingCommissionTable(err)) return { ok: false, error: COMMISSION_TABLES_MISSING };
    throw err;
  }
}

export function isMissingCommissionTable(err: unknown): boolean {
  const m = String((err as { message?: string })?.message ?? err);
  return /relation "(owner_commissions|host_fee_settings)" does not exist/.test(m) || (err as { code?: string })?.code === "42P01";
}

/**
 * The tenant's first Roomeo enquiry to this host: the earliest of
 * - a request (applications) to any of the host's listings,
 * - a chat message the tenant sent about one of the host's listings,
 * - a squad request to this host from a squad the tenant was in (counted from when they were in it).
 */
export async function firstEnquiryAt(sql: Sql, tenantId: string, ownerId: string): Promise<string | null> {
  const r = await sql<{ at: string | null }>`select min(at)::text as at from (
      select a.created_at as at from applications a where a.seeker_id = ${tenantId} and a.host_id = ${ownerId}
      union all
      select m.created_at as at from messages m join conversations c on c.id = m.conversation_id join listings l on l.id = c.listing_id
       where m.sender_id = ${tenantId} and l.owner_id = ${ownerId}
      union all
      select greatest(q.created_at, sm.joined_at) as at from squad_requests q join squad_members sm on sm.squad_id = q.squad_id
       where sm.user_id = ${tenantId} and q.owner_id = ${ownerId}
    ) x`;
  return r[0]?.at ?? null;
}

export async function hostSetting(sql: Sql, ownerId: string): Promise<HostFeeSetting | null> {
  const r = (await sql<{ founding_partner: boolean; founding_until: string | null }>`select founding_partner, founding_until::text as founding_until from host_fee_settings where owner_id = ${ownerId}`)[0];
  return r ? { foundingPartner: Boolean(r.founding_partner), foundingUntil: r.founding_until } : null;
}

/** Rate a host would pay on a move-in today (owner-only copy). */
export async function hostRateNow(sql: Sql, ownerId: string, today: string = istYmd(new Date())): Promise<number> {
  try {
    return rateFor(await hostSetting(sql, ownerId), today).ratePct;
  } catch (err) {
    if (isMissingCommissionTable(err)) return rateFor(null, today).ratePct;
    throw err;
  }
}

/** One month's rent for this bed: the signed deal agreement, else the move-in invite, else the listing. */
async function stayRent(sql: Sql, tenantId: string, listingId: string, squadRequestId?: string | null): Promise<number> {
  const a = squadRequestId
    ? (await sql<{ terms_json: string }>`select terms_json from deal_agreements where squad_request_id = ${squadRequestId} and cancelled_at is null order by issued_at desc nulls last limit 1`)[0]
    : (await sql<{ terms_json: string }>`select terms_json from deal_agreements where seeker_id = ${tenantId} and listing_id = ${listingId} and cancelled_at is null order by issued_at desc nulls last, created_at desc limit 1`)[0];
  if (a) {
    try {
      const n = Number(JSON.parse(a.terms_json)?.monthlyRent);
      if (Number.isInteger(n) && n > 0) return n;
    } catch {
      /* fall through */
    }
  }
  if (!squadRequestId) {
    const i = (await sql<{ rent_inr: number }>`select rent_inr from movein_invites where tenant_id = ${tenantId} and listing_id = ${listingId} and status <> 'CANCELLED' order by created_at desc limit 1`)[0];
    if (i && Number(i.rent_inr) > 0) return Number(i.rent_inr);
  }
  const l = (await sql<{ monthly_rent: number }>`select monthly_rent from listings where id = ${listingId}`)[0];
  return Number(l?.monthly_rent ?? 0);
}

export type CreateResult =
  | { created: true; id: string; tenantId: string; ratePct: number; feeInr: number; gstInr: number; totalInr: number; dueOn: string; founding: boolean }
  | { created: false; tenantId?: string; reason: "off" | "exists" | "not_confirmed" | "no_enquiry" | "outside_window" | "no_rent"; days?: number | null };

/** One commission row for one tenant (one bed). Idempotent on `key`. */
async function createOne(
  sql: Sql,
  d: { key: string; squadMoveInId: string | null; squadRequestId: string | null; listingId: string; ownerId: string; tenantId: string; confirmedAt: string; rentInr?: number },
): Promise<CreateResult> {
  const existing = (await sql<{ id: string }>`select id from owner_commissions where move_in_id = ${d.key}`)[0];
  if (existing) return { created: false, tenantId: d.tenantId, reason: "exists" };
  const moveInOn = istYmd(d.confirmedAt);
  const first = await firstEnquiryAt(sql, d.tenantId, d.ownerId);
  if (!first) return { created: false, tenantId: d.tenantId, reason: "no_enquiry" };
  const att = attributed(first, moveInOn);
  if (!att.ok) return { created: false, tenantId: d.tenantId, reason: "outside_window", days: att.days };
  const rent = d.rentInr ?? (await stayRent(sql, d.tenantId, d.listingId, d.squadRequestId));
  if (!(rent > 0)) return { created: false, tenantId: d.tenantId, reason: "no_rent" };
  const rate = rateFor(await hostSetting(sql, d.ownerId), moveInOn);
  const amt = commissionAmounts(rent, rate.ratePct, ownerFeeGstPct());
  const id = crypto.randomUUID();
  const link = paymentLinkStub(id);
  const dueOn = commissionDueOn(moveInOn);
  const ins = await sql<{ id: string }>`insert into owner_commissions (id, move_in_id, squad_move_in_id, listing_id, owner_id, tenant_id, first_enquiry_at, move_in_on, attribution_days, rent_inr, rate_pct, founding_rate,
      fee_inr, gst_pct, gst_inr, total_inr, amount_due_inr, basis_on, due_on, status, payment_link_mode, payment_link_ref)
    values (${id}, ${d.key}, ${d.squadMoveInId}, ${d.listingId}, ${d.ownerId}, ${d.tenantId}, ${first}::timestamptz, ${moveInOn}::date, ${att.days}, ${rent}, ${rate.ratePct}, ${rate.founding},
      ${amt.feeInr}, ${amt.gstPct}, ${amt.gstInr}, ${amt.totalInr}, ${amt.totalInr}, ${moveInOn}::date, ${dueOn}::date, 'due', ${link.mode}, ${link.ref})
    on conflict (move_in_id) do nothing returning id`;
  if (!ins.length) return { created: false, tenantId: d.tenantId, reason: "exists" };
  const amount = amt.gstInr > 0 ? `₹${amt.feeInr} + ₹${amt.gstInr} GST = ₹${amt.totalInr}` : `₹${amt.feeInr}`;
  await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${d.ownerId}, 'application', 'Roomeo commission due',
    ${`A tenant moved in through Roomeo. Commission ${amount}, due by ${dueOn}. Roomeo will send a payment link.`}, '/owner-fees')`;
  return { created: true, id, tenantId: d.tenantId, ratePct: rate.ratePct, feeInr: amt.feeInr, gstInr: amt.gstInr, totalInr: amt.totalInr, dueOn, founding: rate.founding };
}

/**
 * Create the commission for a confirmed 1:1 move-in. Idempotent (one row per move_ins row).
 * `force` skips the switch check (tests); production callers go through `ownerFeeActive()`.
 */
export async function createCommissionForMoveIn(sql: Sql, moveInId: string, opts: { force?: boolean } = {}): Promise<CreateResult> {
  if (!opts.force && !ownerFeeActive()) return { created: false, reason: "off" };
  const m = (await sql<{ listing_id: string; seeker_id: string; owner_id: string; confirmed_at: string | null }>`select listing_id, seeker_id, owner_id, confirmed_at::text as confirmed_at from move_ins where id = ${moveInId}`)[0];
  if (!m?.confirmed_at) return { created: false, reason: "not_confirmed" };
  return createOne(sql, { key: moveInId, squadMoveInId: null, squadRequestId: null, listingId: m.listing_id, ownerId: m.owner_id, tenantId: m.seeker_id, confirmedAt: m.confirmed_at });
}

/**
 * Squad move-in: one commission per bed, i.e. per squad member who confirmed moving in (and is still in the squad).
 * The unit's rent is split equally across those tenants (nearest rupee); each pays on their share. Idempotent per member.
 */
export async function createCommissionsForSquadMoveIn(sql: Sql, squadMoveInId: string, opts: { force?: boolean } = {}): Promise<CreateResult[]> {
  if (!opts.force && !ownerFeeActive()) return [{ created: false, reason: "off" }];
  const m = (await sql<{ squad_request_id: string; squad_id: string; listing_id: string; owner_id: string; confirmed_at: string | null }>`select squad_request_id, squad_id, listing_id, owner_id, confirmed_at::text as confirmed_at from squad_move_ins where id = ${squadMoveInId}`)[0];
  if (!m?.confirmed_at) return [{ created: false, reason: "not_confirmed" }];
  const tenants = await sql<{ user_id: string }>`select c.user_id from squad_move_in_confirms c join squad_members sm on sm.squad_id = ${m.squad_id} and sm.user_id = c.user_id and sm.left_at is null
    where c.squad_move_in_id = ${squadMoveInId} order by c.confirmed_at, c.user_id`;
  const out: CreateResult[] = [];
  if (!tenants.length) return out;
  const unitRent = await stayRent(sql, tenants[0].user_id, m.listing_id, m.squad_request_id);
  const rentInr = squadBedRentInr(unitRent, tenants.length);
  for (const t of tenants)
    out.push(await createOne(sql, { key: `squad:${squadMoveInId}:${t.user_id}`, squadMoveInId, squadRequestId: m.squad_request_id, listingId: m.listing_id, ownerId: m.owner_id, tenantId: t.user_id, confirmedAt: m.confirmed_at, rentInr }));
  return out;
}

/** Called from the 1:1 move-in confirm path. Never throws: a commission hiccup must not break the move-in. */
export async function commissionOnMoveIn(sql: Sql, moveInId: string): Promise<CreateResult | null> {
  if (!ownerFeeActive()) return null;
  try {
    return await createCommissionForMoveIn(sql, moveInId);
  } catch (err) {
    console.error("[owner-fee] commission skipped", isMissingCommissionTable(err) ? "(migration 0027 not applied)" : err);
    return null;
  }
}

/** Called from the squad move-in confirm path. Never throws. */
export async function commissionsOnSquadMoveIn(sql: Sql, squadMoveInId: string): Promise<CreateResult[] | null> {
  if (!ownerFeeActive()) return null;
  try {
    return await createCommissionsForSquadMoveIn(sql, squadMoveInId);
  } catch (err) {
    console.error("[owner-fee] squad commissions skipped", isMissingCommissionTable(err) ? "(migration 0027 not applied)" : err);
    return null;
  }
}

export type CommissionRow = {
  id: string; moveInId: string; squad: boolean; listingId: string; listingTitle: string; ownerId: string; ownerName: string; tenantId: string; tenantName: string;
  firstEnquiryAt: string; moveInOn: string; attributionDays: number; rentInr: number; ratePct: number; founding: boolean; feeInr: number; gstPct: number; gstInr: number; totalInr: number;
  amountDueInr: number; dueOn: string; status: CommissionStatus; paymentLinkMode: string; paymentLinkRef: string; paidOn: string | null; paidInr: number | null; paidRef: string;
  vacatedOn: string | null; earlyExit: boolean; refundInr: number | null; refundedOn: string | null; refundRef: string;
};

const COLS = `c.id, c.move_in_id, c.squad_move_in_id, c.listing_id, coalesce(l.title, '') as listing_title, c.owner_id, coalesce(op.full_name, 'Owner') as owner_name, c.tenant_id, coalesce(tp.full_name, 'Tenant') as tenant_name,
  c.first_enquiry_at::text as first_enquiry_at, c.move_in_on::text as move_in_on, c.attribution_days, c.rent_inr, c.rate_pct, c.founding_rate, c.fee_inr, c.gst_pct, c.gst_inr, c.total_inr, c.amount_due_inr,
  c.due_on::text as due_on, c.status, c.payment_link_mode, c.payment_link_ref, c.paid_on::text as paid_on, c.paid_inr, c.paid_ref, c.vacated_on::text as vacated_on, c.early_exit_recorded_by,
  c.refund_inr, c.refunded_on::text as refunded_on, c.refund_ref`;
const FROM = `from owner_commissions c left join listings l on l.id = c.listing_id left join profiles op on op.user_id = c.owner_id left join profiles tp on tp.user_id = c.tenant_id`;

function toRow(r: Record<string, unknown>): CommissionRow {
  const n = (v: unknown) => Number(v ?? 0);
  const s = (v: unknown) => (v == null ? "" : String(v));
  const opt = (v: unknown) => (v == null ? null : s(v));
  return {
    id: s(r.id), moveInId: s(r.move_in_id), squad: r.squad_move_in_id != null, listingId: s(r.listing_id), listingTitle: s(r.listing_title), ownerId: s(r.owner_id), ownerName: s(r.owner_name),
    tenantId: s(r.tenant_id), tenantName: s(r.tenant_name), firstEnquiryAt: s(r.first_enquiry_at), moveInOn: s(r.move_in_on), attributionDays: n(r.attribution_days), rentInr: n(r.rent_inr),
    ratePct: n(r.rate_pct), founding: Boolean(r.founding_rate), feeInr: n(r.fee_inr), gstPct: n(r.gst_pct), gstInr: n(r.gst_inr), totalInr: n(r.total_inr), amountDueInr: n(r.amount_due_inr),
    dueOn: s(r.due_on), status: s(r.status) as CommissionStatus, paymentLinkMode: s(r.payment_link_mode), paymentLinkRef: s(r.payment_link_ref), paidOn: opt(r.paid_on),
    paidInr: r.paid_inr == null ? null : n(r.paid_inr), paidRef: s(r.paid_ref), vacatedOn: opt(r.vacated_on), earlyExit: r.early_exit_recorded_by != null,
    refundInr: r.refund_inr == null ? null : n(r.refund_inr), refundedOn: opt(r.refunded_on), refundRef: s(r.refund_ref),
  };
}

export async function ownerCommissions(sql: Sql, ownerId: string): Promise<CommissionRow[]> {
  return (await sql.query(`select ${COLS} ${FROM} where c.owner_id = $1 order by c.due_on desc, c.created_at desc limit 200`, [ownerId])).map((r) => toRow(r as Record<string, unknown>));
}

export async function allCommissions(sql: Sql, status?: CommissionStatus): Promise<CommissionRow[]> {
  const rows = status
    ? await sql.query(`select ${COLS} ${FROM} where c.status = $1 order by c.due_on asc, c.created_at desc limit 500`, [status])
    : await sql.query(`select ${COLS} ${FROM} order by (c.status in ('due','due_50')) desc, c.due_on asc, c.created_at desc limit 500`, []);
  return rows.map((r) => toRow(r as Record<string, unknown>));
}

async function one(sql: Sql, id: string) {
  const r = (await sql.query(`select ${COLS} ${FROM} where c.id = $1`, [id]))[0];
  if (!r) throw new Error("Commission not found.");
  return toRow(r as Record<string, unknown>);
}

/** Admin: owner paid what's due now (full, or 50% after an early exit). */
export async function markCommissionPaid(sql: Sql, id: string, adminId: string, paidOn: string, ref: string) {
  const c = await one(sql, id);
  if (!canMarkPaid(c.status)) throw new Error(`Only a due commission can be marked paid (this one is ${c.status}).`);
  if (paidOn < c.moveInOn) throw new Error("Paid date can't be before the move-in.");
  const r = await sql<{ id: string }>`update owner_commissions set status = 'paid', paid_on = ${paidOn}::date, paid_inr = amount_due_inr, paid_ref = ${ref}, paid_recorded_by = ${adminId}, updated_at = now()
    where id = ${id} and status in ('due','due_50') returning id`;
  if (!r.length) throw new Error("Someone else changed this commission. Reload.");
  return one(sql, id);
}

/** Admin: tenant left within 15 days and the owner hasn't paid yet → the owner owes 50% (status due_50). */
export async function recordEarlyExit(sql: Sql, id: string, adminId: string, vacatedOn: string) {
  const c = await one(sql, id);
  if (!canRecordEarlyExit(c.status)) throw new Error(`An early exit can only be recorded on an unpaid commission (this one is ${c.status}). If it's paid, record the 50% refund.`);
  if (vacatedOn < c.moveInOn) throw new Error(`The move-out date is before the move-in (${c.moveInOn}).`);
  if (!refundEligible(c.moveInOn, vacatedOn)) throw new Error(`The tenant moved out more than 15 days after moving in (${c.moveInOn}), so the full commission stays due.`);
  const due = earlyExitDueInr(c.feeInr, c.gstInr);
  const r = await sql<{ id: string }>`update owner_commissions set status = 'due_50', amount_due_inr = ${due}, vacated_on = ${vacatedOn}::date, early_exit_recorded_by = ${adminId}, updated_at = now()
    where id = ${id} and status = 'due' returning id`;
  if (!r.length) throw new Error("Someone else changed this commission. Reload.");
  return one(sql, id);
}

/** Admin: tenant left within 15 days after the owner paid in full → 50% of the commission + 50% of any GST back. */
export async function recordCommissionRefund(sql: Sql, id: string, adminId: string, d: { vacatedOn: string; refundedOn: string; ref: string }) {
  const c = await one(sql, id);
  if (!canRefund50(c.status, c.earlyExit)) throw new Error(c.earlyExit ? "This commission was already halved for an early exit; there's nothing more to refund." : `Only a paid commission can get the 50% refund (this one is ${c.status}).`);
  if (!refundEligible(c.moveInOn, d.vacatedOn)) throw new Error(`The tenant moved out more than 15 days after moving in (${c.moveInOn}), so there's no refund.`);
  const amount = refundInr(c.feeInr, c.gstInr);
  const r = await sql<{ id: string }>`update owner_commissions set status = 'refunded_50', vacated_on = ${d.vacatedOn}::date, refund_inr = ${amount}, refunded_on = ${d.refundedOn}::date,
    refund_ref = ${d.ref}, refund_recorded_by = ${adminId}, updated_at = now() where id = ${id} and status = 'paid' returning id`;
  if (!r.length) throw new Error("Someone else changed this commission. Reload.");
  return one(sql, id);
}

/** Admin: set or clear a host's founding-partner rate. End date defaults to 6 months from today. */
export async function setFoundingPartner(sql: Sql, ownerId: string, adminId: string, d: { on: boolean; until?: string | null; note?: string; today?: string }) {
  const today = d.today ?? istYmd(new Date());
  const until = d.on ? (d.until || defaultFoundingUntil(today)) : null;
  if (until && until < today) throw new Error("The founding end date is in the past.");
  await sql`insert into host_fee_settings (owner_id, founding_partner, founding_until, note, set_by, set_at) values (${ownerId}, ${d.on}, ${until}::date, ${d.note ?? ""}, ${adminId}, now())
    on conflict (owner_id) do update set founding_partner = excluded.founding_partner, founding_until = excluded.founding_until, note = excluded.note, set_by = excluded.set_by, set_at = now()`;
  return { ownerId, foundingPartner: d.on, foundingUntil: until };
}

export async function foundingHosts(sql: Sql) {
  return sql<{ owner_id: string; full_name: string | null; founding_until: string | null; note: string }>`select s.owner_id, p.full_name, s.founding_until::text as founding_until, s.note
    from host_fee_settings s left join profiles p on p.user_id = s.owner_id where s.founding_partner order by s.founding_until`;
}
