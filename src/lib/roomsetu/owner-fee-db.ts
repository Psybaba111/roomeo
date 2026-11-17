// Owner commission records. Pure SQL with relative imports so it runs under node tests (PGlite).
import type { Sql } from "../db.ts";
import { applyCreditsToFee, creditEvent, restoreCreditsForFee } from "./fee-credits-db.ts";
import {
  attributed,
  canMarkPaid,
  canRecordEarlyExit,
  canRefund50,
  commissionDueOn,
  flatCommissionAmounts,
  foundingCommissionAmounts,
  ownerFeeFlatInr,
  defaultFoundingUntil,
  earlyExitDueInr,
  istYmd,
  ownerFeeGstPct,
  ownerFeeFlag,
  paymentLinkStub,
  rateFor,
  refundEligible,
  refundInr,
  squadBedRentInr,
  type CommissionStatus,
  type HostFeeSetting,
} from "./owner-fee.ts";

/**
 * True when OWNER_FEE_ENABLED is on (default OFF). Since 17 Nov 2026 (10:05 PM) the owner's ₹499 is charged only
 * after a "deposit + rent advance received" mark, so it runs alongside the tenant fee; while it's on the owner's
 * side of the upfront success fee is ₹0 (pricingConfig), so an owner is never charged twice.
 */
export function ownerFeeActive(): boolean {
  return ownerFeeFlag();
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
  | { created: true; id: string; tenantId: string; ratePct: number; feeInr: number; gstInr: number; totalInr: number; dueOn: string; founding: boolean; creditInr?: number; amountDueInr?: number; status?: CommissionStatus }
  | { created: false; tenantId?: string; reason: "off" | "exists" | "not_confirmed" | "no_enquiry" | "outside_window" | "no_rent" | "founding" | "not_migrated" | "not_marked"; days?: number | null };

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
  // Flat ₹499 all-in per tenant (17 Nov 2026); founding partners pay ₹0 (recorded as a 'waived' row).
  const rate = rateFor(await hostSetting(sql, d.ownerId), moveInOn);
  if (rate.founding) return createWaived(sql, d, { first, moveInOn, days: att.days ?? 0, rent });
  const amt = flatCommissionAmounts(rent, ownerFeeGstPct(), ownerFeeFlatInr());
  const id = crypto.randomUUID();
  const link = paymentLinkStub(id);
  const dueOn = commissionDueOn(moveInOn);
  const ins = await sql<{ id: string }>`insert into owner_commissions (id, move_in_id, squad_move_in_id, listing_id, owner_id, tenant_id, first_enquiry_at, move_in_on, attribution_days, rent_inr, rate_pct, fee_model, founding_rate,
      fee_inr, gst_pct, gst_inr, total_inr, amount_due_inr, basis_on, due_on, status, payment_link_mode, payment_link_ref)
    values (${id}, ${d.key}, ${d.squadMoveInId}, ${d.listingId}, ${d.ownerId}, ${d.tenantId}, ${first}::timestamptz, ${moveInOn}::date, ${att.days}, ${rent}, ${null}, 'flat', ${rate.founding},
      ${amt.feeInr}, ${amt.gstPct}, ${amt.gstInr}, ${amt.totalInr}, ${amt.totalInr}, ${moveInOn}::date, ${dueOn}::date, 'due', ${link.mode}, ${link.ref})
    on conflict (move_in_id) do nothing returning id`;
  if (!ins.length) return { created: false, tenantId: d.tenantId, reason: "exists" };
  const amount = amt.gstInr > 0 ? `₹${amt.totalInr} (GST included)` : `₹${amt.totalInr}`;
  await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${d.ownerId}, 'application', 'Roomeo fee due',
    ${`A tenant moved in through Roomeo. Roomeo's flat fee ${amount}, due by ${dueOn}. Roomeo will send a payment link.`}, '/owner-fees')`;
  return { created: true, id, tenantId: d.tenantId, ratePct: 0, feeInr: amt.feeInr, gstInr: amt.gstInr, totalInr: amt.totalInr, dueOn, founding: rate.founding };
}

/** True once migration 0031 lets owner_commissions hold ₹0 'waived' rows. */
export async function waivedRowsSupported(sql: Sql): Promise<boolean> {
  const r = await sql<{ ok: boolean }>`select exists (select 1 from pg_constraint where conname in ('owner_commissions_status_waived_check', 'owner_commissions_status_v2_check')) as ok`;
  return Boolean(r[0]?.ok);
}

/** Founding partner: ₹0 row, status 'waived', nothing due, no payment link, no invoice. */
async function createWaived(
  sql: Sql,
  d: { key: string; squadMoveInId: string | null; listingId: string; ownerId: string; tenantId: string },
  m: { first: string; moveInOn: string; days: number; rent: number },
): Promise<CreateResult> {
  // Without 0031 a ₹0 row would break the table's checks: record nothing (the owner still owes nothing).
  if (!(await waivedRowsSupported(sql))) return { created: false, tenantId: d.tenantId, reason: "founding" };
  const amt = foundingCommissionAmounts(m.rent);
  const id = crypto.randomUUID();
  const ins = await sql<{ id: string }>`insert into owner_commissions (id, move_in_id, squad_move_in_id, listing_id, owner_id, tenant_id, first_enquiry_at, move_in_on, attribution_days, rent_inr, rate_pct, fee_model, founding_rate,
      fee_inr, gst_pct, gst_inr, total_inr, amount_due_inr, basis_on, due_on, status, payment_link_mode, payment_link_ref)
    values (${id}, ${d.key}, ${d.squadMoveInId}, ${d.listingId}, ${d.ownerId}, ${d.tenantId}, ${m.first}::timestamptz, ${m.moveInOn}::date, ${m.days}, ${m.rent}, ${null}, 'flat', ${true},
      0, 0, 0, 0, 0, ${m.moveInOn}::date, ${m.moveInOn}::date, 'waived', 'none', '')
    on conflict (move_in_id) do nothing returning id`;
  if (!ins.length) return { created: false, tenantId: d.tenantId, reason: "exists" };
  await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${d.ownerId}, 'application', 'No Roomeo fee: founding partner',
    ${"A tenant moved in through Roomeo. You're a founding partner, so the Roomeo fee is ₹0. Nothing to pay."}, '/owner-fees')`;
  return { created: true, id, tenantId: d.tenantId, ratePct: 0, feeInr: amt.feeInr, gstInr: 0, totalInr: 0, dueOn: m.moveInOn, founding: true };
}

/** Is this host a founding partner today (owner-only copy)? Missing tables → false. */
export async function hostFoundingNow(sql: Sql, ownerId: string, today: string = istYmd(new Date())): Promise<boolean> {
  try {
    return rateFor(await hostSetting(sql, ownerId), today).founding;
  } catch (err) {
    if (isMissingCommissionTable(err)) return false;
    throw err;
  }
}

/**
 * Create the commission for a confirmed 1:1 move-in. Idempotent (one row per move_ins row).
 * `force` skips the switch check (tests); production callers go through `ownerFeeActive()`.
 */
export async function createCommissionForMoveIn(sql: Sql, moveInId: string, opts: { force?: boolean } = {}): Promise<CreateResult> {
  if (!opts.force && !ownerFeeActive()) return { created: false, reason: "off" };
  const m = (await sql<{ listing_id: string; seeker_id: string; owner_id: string; confirmed_at: string | null; application_id: string | null }>`select listing_id, seeker_id, owner_id, confirmed_at::text as confirmed_at, application_id from move_ins where id = ${moveInId}`)[0];
  if (!m?.confirmed_at) return { created: false, reason: "not_confirmed" };
  // A deposit-triggered fee already covers this stay: never charge it twice.
  if (m.application_id) {
    const dep = (await sql<{ id: string }>`select id from owner_commissions where move_in_id = ${`deposit:${m.application_id}`}`)[0];
    if (dep) return { created: false, reason: "exists" };
  }
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

/**
 * Called from the 1:1 move-in confirm path. Since 17 Nov 2026 a move-in confirmation never charges the owner:
 * the ₹499 is created only by a "deposit + rent advance received" mark (markDepositReceived). Kept as a no-op
 * so callers don't change.
 */
export async function commissionOnMoveIn(_sql: Sql, _moveInId: string): Promise<CreateResult | null> {
  return null;
}

/** Squad move-in confirm path: no owner fee at confirmation either (squad deposit marks are a follow-up). */
export async function commissionsOnSquadMoveIn(_sql: Sql, _squadMoveInId: string): Promise<CreateResult[] | null> {
  return null;
}

export type CommissionRow = {
  id: string; moveInId: string; squad: boolean; listingId: string; listingTitle: string; ownerId: string; ownerName: string; tenantId: string; tenantName: string;
  firstEnquiryAt: string; moveInOn: string; attributionDays: number; rentInr: number; ratePct: number; founding: boolean; feeInr: number; gstPct: number; gstInr: number; totalInr: number;
  amountDueInr: number; dueOn: string; status: CommissionStatus; paymentLinkMode: string; paymentLinkRef: string; paidOn: string | null; paidInr: number | null; paidRef: string;
  vacatedOn: string | null; earlyExit: boolean; refundInr: number | null; refundedOn: string | null; refundRef: string;
  trigger: string; creditInr: number; depositMarkId: string | null; voidReason: string; basisOn: string;
};

const COLS = `c.id, c.move_in_id, c.squad_move_in_id, c.listing_id, coalesce(l.title, '') as listing_title, c.owner_id, coalesce(op.full_name, 'Owner') as owner_name, c.tenant_id, coalesce(tp.full_name, 'Tenant') as tenant_name,
  c.first_enquiry_at::text as first_enquiry_at, c.move_in_on::text as move_in_on, c.attribution_days, c.rent_inr, c.rate_pct, c.founding_rate, c.fee_inr, c.gst_pct, c.gst_inr, c.total_inr, c.amount_due_inr,
  c.due_on::text as due_on, c.status, c.payment_link_mode, c.payment_link_ref, c.paid_on::text as paid_on, c.paid_inr, c.paid_ref, c.vacated_on::text as vacated_on, c.early_exit_recorded_by,
  c.refund_inr, c.refunded_on::text as refunded_on, c.refund_ref, c.basis_on::text as basis_on`;
/** 0032 columns, only where that migration ran (it no-ops without 0027). */
const COLS_V2 = `, c.trigger_kind, c.credit_applied_inr, c.deposit_mark_id, c.void_reason`;
let v2Cols: boolean | null = null;
async function cols(sql: Sql): Promise<string> {
  if (v2Cols === null || v2Cols === false) v2Cols = await ownerFeeSchemaReady(sql);
  return v2Cols ? COLS + COLS_V2 : COLS;
}

/** True once migration 0032 has upgraded owner_commissions (needs 0027 first). */
export async function ownerFeeSchemaReady(sql: Sql): Promise<boolean> {
  const r = await sql<{ ok: boolean }>`select exists (select 1 from pg_constraint where conname = 'owner_commissions_status_v2_check') as ok`;
  return Boolean(r[0]?.ok);
}
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
    trigger: s(r.trigger_kind) || "move_in", creditInr: n(r.credit_applied_inr), depositMarkId: opt(r.deposit_mark_id), voidReason: s(r.void_reason), basisOn: s(r.basis_on),
  };
}

export async function ownerCommissions(sql: Sql, ownerId: string): Promise<CommissionRow[]> {
  return (await sql.query(`select ${await cols(sql)} ${FROM} where c.owner_id = $1 order by c.due_on desc, c.created_at desc limit 200`, [ownerId])).map((r) => toRow(r as Record<string, unknown>));
}

export async function allCommissions(sql: Sql, status?: CommissionStatus): Promise<CommissionRow[]> {
  const rows = status
    ? await sql.query(`select ${await cols(sql)} ${FROM} where c.status = $1 order by c.due_on asc, c.created_at desc limit 500`, [status])
    : await sql.query(`select ${await cols(sql)} ${FROM} order by (c.status in ('due','due_50')) desc, c.due_on asc, c.created_at desc limit 500`, []);
  return rows.map((r) => toRow(r as Record<string, unknown>));
}

async function one(sql: Sql, id: string) {
  const r = (await sql.query(`select ${await cols(sql)} ${FROM} where c.id = $1`, [id]))[0];
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
  const half = earlyExitDueInr(c.feeInr, c.gstInr);
  // Credit already used on this fee counts first; anything over the 50% goes back to the credit (never cash).
  const keep = Math.min(c.creditInr, half);
  if (c.creditInr > keep) await restoreCreditsForFee(sql, { feeKind: "owner_fee", feeId: id, amountInr: c.creditInr - keep, actorId: adminId, reason: "early exit: owner owes 50%" });
  const due = half - keep;
  const r = due > 0
    ? await sql<{ id: string }>`update owner_commissions set status = 'due_50', amount_due_inr = ${due}, vacated_on = ${vacatedOn}::date, early_exit_recorded_by = ${adminId}, updated_at = now()
        where id = ${id} and status = 'due' returning id`
    : await sql<{ id: string }>`update owner_commissions set status = 'paid', amount_due_inr = 0, paid_on = ${vacatedOn}::date, paid_inr = 0, paid_ref = 'referral credit', paid_recorded_by = ${adminId},
        vacated_on = ${vacatedOn}::date, early_exit_recorded_by = ${adminId}, updated_at = now() where id = ${id} and status = 'due' returning id`;
  if (!r.length) throw new Error("Someone else changed this commission. Reload.");
  if (c.creditInr > 0 && (await ownerFeeSchemaReady(sql))) await sql`update owner_commissions set credit_applied_inr = ${keep} where id = ${id}`;
  return one(sql, id);
}

/** Admin: tenant left within 15 days after the owner paid in full → 50% of the commission + 50% of any GST back. */
export async function recordCommissionRefund(sql: Sql, id: string, adminId: string, d: { vacatedOn: string; refundedOn: string; ref: string }) {
  const c = await one(sql, id);
  if (!canRefund50(c.status, c.earlyExit)) throw new Error(c.earlyExit ? "This commission was already halved for an early exit; there's nothing more to refund." : `Only a paid commission can get the 50% refund (this one is ${c.status}).`);
  if (!refundEligible(c.moveInOn, d.vacatedOn)) throw new Error(`The tenant moved out more than 15 days after moving in (${c.moveInOn}), so there's no refund.`);
  // The owner ends up paying 50%. Credit used on the fee goes back first (credit is never cash); the rest is a cash refund.
  const back = refundInr(c.feeInr, c.gstInr);
  const creditBack = Math.min(c.creditInr, back);
  if (creditBack > 0) {
    await restoreCreditsForFee(sql, { feeKind: "owner_fee", feeId: id, amountInr: creditBack, actorId: adminId, reason: "tenant left within 15 days: 50% back" });
    await sql`update owner_commissions set credit_applied_inr = credit_applied_inr - ${creditBack} where id = ${id}`;
  }
  const amount = Math.min(Number(c.paidInr ?? 0), back - creditBack);
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

// ─── Owner ₹499 after "deposit + rent advance received" (17 Nov 2026, 10:05 PM IST) ─────────────────────────────
//
// The owner (or an admin) marks the deposit + first rent advance as received on an accepted request. Only that
// mark creates the owner's fee: never at listing, acceptance, signing or move-in confirmation.
// - One mark per request (deposit_marks.application_id unique): marking twice, or owner + admin both marking,
//   never creates a second fee.
// - Undo (deposit refunded / deal fell through) before the owner has paid cash: the fee becomes 'void' and any
//   credit used on it is restored. After a cash payment, undo is refused: record the 50% refund instead.
// - Marking again after an undo reuses the same fee row (back to due), so it still can't double charge.
// - Founding partners: a ₹0 'waived' row (0031/0032 logic), no payment link, no invoice.
// - Early exit (tenant leaves within 15 days of moving in): unchanged 50% rule, ₹250 of ₹499.
// - Referral credit: applied automatically to the new fee; fully covered → 'paid' by credit (paid_inr 0).

export type DepositMark = {
  id: string; applicationId: string; listingId: string; ownerId: string; tenantId: string; receivedOn: string; markedAt: string; markedBy: string;
  markedRole: "owner" | "admin"; undoneAt: string | null; undoneBy: string | null; undoReason: string; markCount: number;
};
function toMark(r: Record<string, unknown>): DepositMark {
  const s = (v: unknown) => (v == null ? "" : String(v));
  return {
    id: s(r.id), applicationId: s(r.application_id), listingId: s(r.listing_id), ownerId: s(r.owner_id), tenantId: s(r.tenant_id), receivedOn: s(r.received_on),
    markedAt: s(r.marked_at), markedBy: s(r.marked_by), markedRole: s(r.marked_role) === "admin" ? "admin" : "owner", undoneAt: r.undone_at == null ? null : s(r.undone_at),
    undoneBy: r.undone_by == null ? null : s(r.undone_by), undoReason: s(r.undo_reason), markCount: Number(r.mark_count ?? 1),
  };
}
const MARK_COLS = `id, application_id, listing_id, owner_id, tenant_id, received_on::text as received_on, marked_at::text as marked_at, marked_by, marked_role,
  undone_at::text as undone_at, undone_by, undo_reason, mark_count`;

export async function depositMarkFor(sql: Sql, applicationId: string): Promise<DepositMark | null> {
  const r = (await sql.query(`select ${MARK_COLS} from deposit_marks where application_id = $1`, [applicationId]))[0];
  return r ? toMark(r as Record<string, unknown>) : null;
}

async function dealFor(sql: Sql, applicationId: string) {
  const a = (await sql<{ id: string; listing_id: string; seeker_id: string; host_id: string; status: string; created_at: string }>`
    select id, listing_id, seeker_id, host_id, status, created_at::text as created_at from applications where id = ${applicationId}`)[0];
  if (!a) throw new Error("Request not found.");
  const m = (await sql<{ id: string; confirmed_at: string | null }>`select id, confirmed_at::text as confirmed_at from move_ins where application_id = ${applicationId} limit 1`)[0] ?? null;
  return { app: a, moveIn: m };
}

export type MarkResult = { mark: DepositMark; already: boolean; commission: CreateResult | null };

/** Owner or admin: "deposit + rent advance received". Idempotent. Creates the owner fee only while OWNER_FEE_ENABLED is on. */
export async function markDepositReceived(
  sql: Sql,
  d: { applicationId: string; actorId: string; role: "owner" | "admin"; receivedOn?: string; today?: string; force?: boolean },
): Promise<MarkResult> {
  const today = d.today ?? istYmd(new Date());
  const { app, moveIn } = await dealFor(sql, d.applicationId);
  if (d.role === "owner" && app.host_id !== d.actorId) throw new Error("Only the owner of this listing can mark the deposit as received.");
  if (app.status !== "ACCEPTED" && !moveIn) throw new Error("Mark this only after you've accepted the request and received the deposit and rent advance.");
  const receivedOn = d.receivedOn ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) throw new Error("Pick the date you received it.");
  if (receivedOn > today) throw new Error("That date is in the future.");
  if (receivedOn < istYmd(app.created_at)) throw new Error("That date is before the request was made.");
  const existing = await depositMarkFor(sql, d.applicationId);
  let already = false;
  if (existing && !existing.undoneAt) {
    already = true;
  } else if (existing) {
    await sql`update deposit_marks set undone_at = null, undone_by = null, undo_reason = '', received_on = ${receivedOn}::date, marked_at = now(), marked_by = ${d.actorId},
      marked_role = ${d.role}, mark_count = mark_count + 1, updated_at = now() where id = ${existing.id} and undone_at is not null`;
  } else {
    await sql`insert into deposit_marks (id, application_id, listing_id, owner_id, tenant_id, received_on, marked_by, marked_role)
      values (${crypto.randomUUID()}, ${d.applicationId}, ${app.listing_id}, ${app.host_id}, ${app.seeker_id}, ${receivedOn}::date, ${d.actorId}, ${d.role})
      on conflict (application_id) do nothing`;
  }
  const mark = (await depositMarkFor(sql, d.applicationId)) as DepositMark;
  if (!already) await creditEvent(sql, { entity: "deposit_mark", entityId: mark.id, action: existing ? "re-marked" : "marked", actorId: d.actorId, userId: app.host_id, note: `received ${receivedOn} (${d.role})` });
  let commission: CreateResult | null = null;
  if (d.force || ownerFeeActive()) {
    try {
      commission = await createCommissionForDeposit(sql, mark.id, { force: true, actorId: d.actorId, moveInConfirmedAt: moveIn?.confirmed_at ?? null });
    } catch (err) {
      if (!isMissingCommissionTable(err)) throw err;
      commission = { created: false, reason: "not_migrated" };
    }
  }
  return { mark, already, commission };
}

/**
 * The owner fee for an active deposit mark. Idempotent: an existing live row (or a pre-17 Nov move-in row for the
 * same request) means nothing new. A 'void' row from an earlier undo is brought back to life instead of a new row.
 */
export async function createCommissionForDeposit(sql: Sql, markId: string, opts: { force?: boolean; actorId?: string; moveInConfirmedAt?: string | null } = {}): Promise<CreateResult> {
  if (!opts.force && !ownerFeeActive()) return { created: false, reason: "off" };
  if (!(await ownerFeeSchemaReady(sql))) return { created: false, reason: "not_migrated" };
  const mark = (await sql.query(`select ${MARK_COLS} from deposit_marks where id = $1 and undone_at is null`, [markId]))[0];
  if (!mark) return { created: false, reason: "not_marked" };
  const m = toMark(mark as Record<string, unknown>);
  const key = `deposit:${m.applicationId}`;
  const legacy = await sql<{ id: string }>`select c.id from owner_commissions c join move_ins mi on mi.id = c.move_in_id where mi.application_id = ${m.applicationId} and c.status <> 'void'`;
  if (legacy.length) return { created: false, tenantId: m.tenantId, reason: "exists" };
  const prior = (await sql<{ id: string; status: string }>`select id, status from owner_commissions where deposit_mark_id = ${m.id} or move_in_id = ${key} limit 1`)[0];
  if (prior && prior.status !== "void") return { created: false, tenantId: m.tenantId, reason: "exists" };
  const first = await firstEnquiryAt(sql, m.tenantId, m.ownerId);
  if (!first) return { created: false, tenantId: m.tenantId, reason: "no_enquiry" };
  const att = attributed(first, m.receivedOn);
  if (!att.ok) return { created: false, tenantId: m.tenantId, reason: "outside_window", days: att.days };
  const rent = await stayRent(sql, m.tenantId, m.listingId, null);
  if (!(rent > 0)) return { created: false, tenantId: m.tenantId, reason: "no_rent" };
  const founding = rateFor(await hostSetting(sql, m.ownerId), m.receivedOn).founding;
  const amt = founding ? foundingCommissionAmounts(rent) : flatCommissionAmounts(rent, ownerFeeGstPct(), ownerFeeFlatInr());
  const moveInOn = opts.moveInConfirmedAt ? istYmd(opts.moveInConfirmedAt) : m.receivedOn;
  const dueOn = commissionDueOn(m.receivedOn);
  const status: CommissionStatus = founding ? "waived" : "due";
  const id = prior?.id ?? crypto.randomUUID();
  const link = founding ? { mode: "none", ref: "" } : paymentLinkStub(id);
  if (prior) {
    await sql`update owner_commissions set first_enquiry_at = ${first}::timestamptz, move_in_on = ${moveInOn}::date, attribution_days = ${att.days}, rent_inr = ${rent}, rate_pct = ${null},
      fee_model = 'flat', founding_rate = ${founding}, fee_inr = ${amt.feeInr}, gst_pct = ${amt.gstPct}, gst_inr = ${amt.gstInr}, total_inr = ${amt.totalInr}, amount_due_inr = ${amt.totalInr},
      basis_on = ${m.receivedOn}::date, due_on = ${dueOn}::date, status = ${status}, payment_link_mode = ${link.mode}, payment_link_ref = ${link.ref}, paid_on = null, paid_inr = null,
      paid_ref = '', paid_recorded_by = null, vacated_on = null, early_exit_recorded_by = null, refund_inr = null, refunded_on = null, refund_ref = '', refund_recorded_by = null,
      credit_applied_inr = 0, voided_at = null, voided_by = null, void_reason = '', deposit_mark_id = ${m.id}, trigger_kind = 'deposit', updated_at = now()
      where id = ${id} and status = 'void'`;
  } else {
    const ins = await sql<{ id: string }>`insert into owner_commissions (id, move_in_id, squad_move_in_id, listing_id, owner_id, tenant_id, first_enquiry_at, move_in_on, attribution_days, rent_inr,
        rate_pct, fee_model, founding_rate, fee_inr, gst_pct, gst_inr, total_inr, amount_due_inr, basis_on, due_on, status, payment_link_mode, payment_link_ref, trigger_kind, deposit_mark_id)
      values (${id}, ${key}, ${null}, ${m.listingId}, ${m.ownerId}, ${m.tenantId}, ${first}::timestamptz, ${moveInOn}::date, ${att.days}, ${rent}, ${null}, 'flat', ${founding},
        ${amt.feeInr}, ${amt.gstPct}, ${amt.gstInr}, ${amt.totalInr}, ${amt.totalInr}, ${m.receivedOn}::date, ${dueOn}::date, ${status}, ${link.mode}, ${link.ref}, 'deposit', ${m.id})
      on conflict (move_in_id) do nothing returning id`;
    if (!ins.length) return { created: false, tenantId: m.tenantId, reason: "exists" };
  }
  let credit = 0;
  let finalStatus: CommissionStatus = status;
  if (!founding) {
    credit = await applyCreditsToFee(sql, { userId: m.ownerId, feeKind: "owner_fee", feeId: id, feeInr: amt.totalInr, actorId: opts.actorId });
    if (credit > 0) {
      const due = amt.totalInr - credit;
      finalStatus = due <= 0 ? "paid" : "due";
      await sql`update owner_commissions set credit_applied_inr = ${credit}, amount_due_inr = ${Math.max(0, due)}, status = ${finalStatus},
        paid_on = ${due <= 0 ? m.receivedOn : null}::date, paid_inr = ${due <= 0 ? 0 : null}, paid_ref = ${due <= 0 ? "referral credit" : ""},
        paid_recorded_by = ${due <= 0 ? "system" : null}, payment_link_mode = ${due <= 0 ? "none" : link.mode}, updated_at = now() where id = ${id}`;
    }
  }
  const amountDue = founding ? 0 : Math.max(0, amt.totalInr - credit);
  const title = founding ? "No Roomeo fee: founding partner" : amountDue === 0 ? "Roomeo fee covered by your credit" : "Roomeo fee due";
  const body = founding
    ? "You marked the deposit and rent advance as received. You're a founding partner, so the Roomeo fee is ₹0. Nothing to pay."
    : amountDue === 0
      ? `You marked the deposit and rent advance as received. Roomeo's ₹${amt.totalInr} fee is fully covered by your Roomeo credit. Nothing to pay.`
      : `You marked the deposit and rent advance as received. Roomeo's flat fee ₹${amt.totalInr}${amt.gstInr > 0 ? " (GST included)" : ""}${credit > 0 ? `, less ₹${credit} credit = ₹${amountDue}` : ""}, due by ${dueOn}. Roomeo will send a payment link.`;
  await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${m.ownerId}, 'application', ${title}, ${body}, '/owner-fees')`;
  await creditEvent(sql, { entity: "owner_fee", entityId: id, action: prior ? "reinstated" : "created", actorId: opts.actorId ?? "system", userId: m.ownerId, amountInr: amountDue, note: `${finalStatus}${credit ? `, ₹${credit} credit` : ""}` });
  return { created: true, id, tenantId: m.tenantId, ratePct: 0, feeInr: amt.feeInr, gstInr: amt.gstInr, totalInr: amt.totalInr, dueOn, founding, creditInr: credit, amountDueInr: amountDue, status: finalStatus };
}

/** Owner or admin: take the mark back (deposit refunded, deal fell through). Refused once the owner has paid cash. */
export async function undoDepositMark(sql: Sql, d: { applicationId: string; actorId: string; role: "owner" | "admin"; reason: string }): Promise<{ mark: DepositMark; voided: string | null; creditRestored: number }> {
  const why = d.reason.trim().slice(0, 200);
  if (!why) throw new Error("Say why (for example: deposit refunded, tenant didn't move in).");
  const mark = await depositMarkFor(sql, d.applicationId);
  if (!mark || mark.undoneAt) throw new Error("There's no deposit mark to undo.");
  if (d.role === "owner" && mark.ownerId !== d.actorId) throw new Error("Only the owner of this listing can undo this.");
  let voided: string | null = null;
  let creditRestored = 0;
  if (await ownerFeeSchemaReady(sql)) {
    const c = (await sql<{ id: string; status: string; paid_inr: number | null }>`select id, status, paid_inr from owner_commissions where deposit_mark_id = ${mark.id} and status <> 'void'`)[0];
    if (c) {
      if (c.status === "refunded_50" || (c.status === "paid" && Number(c.paid_inr ?? 0) > 0))
        throw new Error("The owner has already paid this fee, so the mark can't be undone. An admin records the 50% refund instead if the tenant left early.");
      creditRestored = await restoreCreditsForFee(sql, { feeKind: "owner_fee", feeId: c.id, actorId: d.actorId, reason: `deposit mark undone: ${why}` });
      await sql`update owner_commissions set status = 'void', amount_due_inr = 0, credit_applied_inr = 0, voided_at = now(), voided_by = ${d.actorId}, void_reason = ${why}, updated_at = now() where id = ${c.id}`;
      await creditEvent(sql, { entity: "owner_fee", entityId: c.id, action: "voided", actorId: d.actorId, userId: mark.ownerId, note: why });
      voided = c.id;
    }
  }
  await sql`update deposit_marks set undone_at = now(), undone_by = ${d.actorId}, undo_reason = ${why}, updated_at = now() where id = ${mark.id}`;
  await creditEvent(sql, { entity: "deposit_mark", entityId: mark.id, action: "undone", actorId: d.actorId, userId: mark.ownerId, note: `${d.role}: ${why}` });
  return { mark: (await depositMarkFor(sql, d.applicationId)) as DepositMark, voided, creditRestored };
}

export type DepositCandidate = { applicationId: string; listingTitle: string; tenantName: string; acceptedAt: string; mark: DepositMark | null; feeStatus: string | null; amountDueInr: number | null };

/** Owner: accepted requests and move-ins, with their deposit mark (if any) and fee status. */
export async function depositCandidates(sql: Sql, ownerId: string): Promise<DepositCandidate[]> {
  const rows = await sql<{ id: string; title: string | null; tenant: string | null; at: string }>`select a.id, l.title, p.full_name as tenant, coalesce(a.updated_at, a.created_at)::text as at
    from applications a left join listings l on l.id = a.listing_id left join profiles p on p.user_id = a.seeker_id
    where a.host_id = ${ownerId} and (a.status = 'ACCEPTED' or exists (select 1 from move_ins mi where mi.application_id = a.id)) order by a.created_at desc limit 50`;
  const ready = await ownerFeeSchemaReady(sql);
  const out: DepositCandidate[] = [];
  for (const r of rows) {
    const mark = await depositMarkFor(sql, r.id);
    const fee = ready && mark ? (await sql<{ status: string; amount_due_inr: number }>`select status, amount_due_inr from owner_commissions where deposit_mark_id = ${mark.id}`)[0] : undefined;
    out.push({ applicationId: r.id, listingTitle: r.title ?? "Listing", tenantName: r.tenant ?? "Tenant", acceptedAt: r.at, mark, feeStatus: fee?.status ?? null, amountDueInr: fee ? Number(fee.amount_due_inr) : null });
  }
  return out;
}

/** Admin: recent deposit marks. */
export async function recentDepositMarks(sql: Sql, limit = 100) {
  return (await sql.query(`select ${MARK_COLS} from deposit_marks order by updated_at desc limit $1`, [limit])).map((r) => toMark(r as Record<string, unknown>));
}
