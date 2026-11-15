// Owner commission records. Pure SQL with relative imports so it runs under node tests (PGlite).
import type { Sql } from "../db.ts";
import { pricingConfig } from "./pricing.ts";
import {
  attributed,
  canMarkPaid,
  canRefund50,
  commissionAmounts,
  commissionDueOn,
  defaultFoundingUntil,
  istYmd,
  ownerFeeState,
  paymentLinkStub,
  rateFor,
  refundEligible,
  refundInr,
  type CommissionStatus,
  type HostFeeSetting,
} from "./owner-fee.ts";

/** True when the owner-fee switch is on and the flat success fee is off. */
export function ownerFeeActive(): boolean {
  return ownerFeeState(pricingConfig().successFeeEnabled).active;
}

/** Missing table (migration 0027 not applied yet) — callers treat the feature as off. */
export function isMissingCommissionTable(err: unknown): boolean {
  const m = String((err as { message?: string })?.message ?? err);
  return /relation "(owner_commissions|host_fee_settings)" does not exist/.test(m) || (err as { code?: string })?.code === "42P01";
}

/**
 * The tenant's first Roomeo enquiry to this host: the earliest request (applications) to any of the host's
 * listings, or the earliest message the tenant sent in a chat about one of the host's listings.
 */
export async function firstEnquiryAt(sql: Sql, tenantId: string, ownerId: string): Promise<string | null> {
  const r = await sql<{ at: string | null }>`select min(at)::text as at from (
      select a.created_at as at from applications a where a.seeker_id = ${tenantId} and a.host_id = ${ownerId}
      union all
      select m.created_at as at from messages m join conversations c on c.id = m.conversation_id join listings l on l.id = c.listing_id
       where m.sender_id = ${tenantId} and l.owner_id = ${ownerId}
    ) x`;
  return r[0]?.at ?? null;
}

export async function hostSetting(sql: Sql, ownerId: string): Promise<HostFeeSetting | null> {
  const r = (await sql<{ founding_partner: boolean; founding_until: string | null }>`select founding_partner, founding_until::text as founding_until from host_fee_settings where owner_id = ${ownerId}`)[0];
  return r ? { foundingPartner: Boolean(r.founding_partner), foundingUntil: r.founding_until } : null;
}

/** Rate a host would pay on a move-in today (for agreement copy). */
export async function hostRateNow(sql: Sql, ownerId: string, today: string = istYmd(new Date())): Promise<number> {
  try {
    return rateFor(await hostSetting(sql, ownerId), today).ratePct;
  } catch (err) {
    if (isMissingCommissionTable(err)) return rateFor(null, today).ratePct;
    throw err;
  }
}

/** One month's rent for this stay: the signed deal agreement, else the move-in invite, else the listing. */
async function stayRent(sql: Sql, tenantId: string, listingId: string): Promise<number> {
  const a = (await sql<{ terms_json: string }>`select terms_json from deal_agreements where seeker_id = ${tenantId} and listing_id = ${listingId} and cancelled_at is null order by issued_at desc nulls last, created_at desc limit 1`)[0];
  if (a) {
    try {
      const n = Number(JSON.parse(a.terms_json)?.monthlyRent);
      if (Number.isInteger(n) && n > 0) return n;
    } catch {
      /* fall through */
    }
  }
  const i = (await sql<{ rent_inr: number }>`select rent_inr from movein_invites where tenant_id = ${tenantId} and listing_id = ${listingId} and status <> 'CANCELLED' order by created_at desc limit 1`)[0];
  if (i && Number(i.rent_inr) > 0) return Number(i.rent_inr);
  const l = (await sql<{ monthly_rent: number }>`select monthly_rent from listings where id = ${listingId}`)[0];
  return Number(l?.monthly_rent ?? 0);
}

export type CreateResult =
  | { created: true; id: string; ratePct: number; feeInr: number; gstInr: number; totalInr: number; dueOn: string; founding: boolean }
  | { created: false; reason: "off" | "exists" | "not_confirmed" | "no_enquiry" | "outside_window" | "no_rent"; days?: number | null };

/**
 * Create the commission for a confirmed move-in. Idempotent (one row per move_ins row).
 * `force` skips the switch check (tests); production callers go through `ownerFeeActive()`.
 */
export async function createCommissionForMoveIn(sql: Sql, moveInId: string, opts: { force?: boolean } = {}): Promise<CreateResult> {
  if (!opts.force && !ownerFeeActive()) return { created: false, reason: "off" };
  const m = (await sql<{ listing_id: string; seeker_id: string; owner_id: string; confirmed_at: string | null }>`select listing_id, seeker_id, owner_id, confirmed_at::text as confirmed_at from move_ins where id = ${moveInId}`)[0];
  if (!m?.confirmed_at) return { created: false, reason: "not_confirmed" };
  const existing = (await sql<{ id: string }>`select id from owner_commissions where move_in_id = ${moveInId}`)[0];
  if (existing) return { created: false, reason: "exists" };
  const moveInOn = istYmd(m.confirmed_at);
  const first = await firstEnquiryAt(sql, m.seeker_id, m.owner_id);
  const att = attributed(first, moveInOn);
  if (!first) return { created: false, reason: "no_enquiry" };
  if (!att.ok) return { created: false, reason: "outside_window", days: att.days };
  const rent = await stayRent(sql, m.seeker_id, m.listing_id);
  if (!(rent > 0)) return { created: false, reason: "no_rent" };
  const rate = rateFor(await hostSetting(sql, m.owner_id), moveInOn);
  const amt = commissionAmounts(rent, rate.ratePct);
  const id = crypto.randomUUID();
  const link = paymentLinkStub(id);
  const dueOn = commissionDueOn(moveInOn);
  const ins = await sql<{ id: string }>`insert into owner_commissions (id, move_in_id, listing_id, owner_id, tenant_id, first_enquiry_at, move_in_on, attribution_days, rent_inr, rate_pct, founding_rate,
      fee_inr, gst_pct, gst_inr, total_inr, basis_on, due_on, status, payment_link_mode, payment_link_ref)
    values (${id}, ${moveInId}, ${m.listing_id}, ${m.owner_id}, ${m.seeker_id}, ${first}::timestamptz, ${moveInOn}::date, ${att.days}, ${rent}, ${rate.ratePct}, ${rate.founding},
      ${amt.feeInr}, ${amt.gstPct}, ${amt.gstInr}, ${amt.totalInr}, ${moveInOn}::date, ${dueOn}::date, 'due', ${link.mode}, ${link.ref})
    on conflict (move_in_id) do nothing returning id`;
  if (!ins.length) return { created: false, reason: "exists" };
  await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${m.owner_id}, 'application', 'Roomeo commission due',
    ${`A tenant moved in through Roomeo. Commission ₹${amt.feeInr} + ₹${amt.gstInr} GST = ₹${amt.totalInr}, due by ${dueOn}. Roomeo will send a payment link.`}, '/owner-fees')`;
  return { created: true, id, ratePct: rate.ratePct, feeInr: amt.feeInr, gstInr: amt.gstInr, totalInr: amt.totalInr, dueOn, founding: rate.founding };
}

/** Called from the move-in confirm path. Never throws: a commission hiccup must not break the move-in. */
export async function commissionOnMoveIn(sql: Sql, moveInId: string): Promise<CreateResult | null> {
  if (!ownerFeeActive()) return null;
  try {
    return await createCommissionForMoveIn(sql, moveInId);
  } catch (err) {
    console.error("[owner-fee] commission skipped", isMissingCommissionTable(err) ? "(migration 0027 not applied)" : err);
    return null;
  }
}

export type CommissionRow = {
  id: string; moveInId: string; listingId: string; listingTitle: string; ownerId: string; ownerName: string; tenantId: string; tenantName: string;
  firstEnquiryAt: string; moveInOn: string; attributionDays: number; rentInr: number; ratePct: number; founding: boolean; feeInr: number; gstPct: number; gstInr: number; totalInr: number;
  dueOn: string; status: CommissionStatus; paymentLinkMode: string; paymentLinkRef: string; paidOn: string | null; paidRef: string; vacatedOn: string | null; refundInr: number | null; refundedOn: string | null; refundRef: string;
};

const COLS = `c.id, c.move_in_id, c.listing_id, coalesce(l.title, '') as listing_title, c.owner_id, coalesce(op.full_name, 'Owner') as owner_name, c.tenant_id, coalesce(tp.full_name, 'Tenant') as tenant_name,
  c.first_enquiry_at::text as first_enquiry_at, c.move_in_on::text as move_in_on, c.attribution_days, c.rent_inr, c.rate_pct, c.founding_rate, c.fee_inr, c.gst_pct, c.gst_inr, c.total_inr,
  c.due_on::text as due_on, c.status, c.payment_link_mode, c.payment_link_ref, c.paid_on::text as paid_on, c.paid_ref, c.vacated_on::text as vacated_on, c.refund_inr, c.refunded_on::text as refunded_on, c.refund_ref`;
const FROM = `from owner_commissions c left join listings l on l.id = c.listing_id left join profiles op on op.user_id = c.owner_id left join profiles tp on tp.user_id = c.tenant_id`;

function toRow(r: Record<string, unknown>): CommissionRow {
  const n = (v: unknown) => Number(v ?? 0);
  const s = (v: unknown) => (v == null ? "" : String(v));
  return {
    id: s(r.id), moveInId: s(r.move_in_id), listingId: s(r.listing_id), listingTitle: s(r.listing_title), ownerId: s(r.owner_id), ownerName: s(r.owner_name), tenantId: s(r.tenant_id), tenantName: s(r.tenant_name),
    firstEnquiryAt: s(r.first_enquiry_at), moveInOn: s(r.move_in_on), attributionDays: n(r.attribution_days), rentInr: n(r.rent_inr), ratePct: n(r.rate_pct), founding: Boolean(r.founding_rate),
    feeInr: n(r.fee_inr), gstPct: n(r.gst_pct), gstInr: n(r.gst_inr), totalInr: n(r.total_inr), dueOn: s(r.due_on), status: s(r.status) as CommissionStatus,
    paymentLinkMode: s(r.payment_link_mode), paymentLinkRef: s(r.payment_link_ref), paidOn: r.paid_on == null ? null : s(r.paid_on), paidRef: s(r.paid_ref),
    vacatedOn: r.vacated_on == null ? null : s(r.vacated_on), refundInr: r.refund_inr == null ? null : n(r.refund_inr), refundedOn: r.refunded_on == null ? null : s(r.refunded_on), refundRef: s(r.refund_ref),
  };
}

export async function ownerCommissions(sql: Sql, ownerId: string): Promise<CommissionRow[]> {
  return (await sql.query(`select ${COLS} ${FROM} where c.owner_id = $1 order by c.due_on desc, c.created_at desc limit 200`, [ownerId])).map((r) => toRow(r as Record<string, unknown>));
}

export async function allCommissions(sql: Sql, status?: CommissionStatus): Promise<CommissionRow[]> {
  const rows = status
    ? await sql.query(`select ${COLS} ${FROM} where c.status = $1 order by c.due_on asc, c.created_at desc limit 500`, [status])
    : await sql.query(`select ${COLS} ${FROM} order by (c.status = 'due') desc, c.due_on asc, c.created_at desc limit 500`, []);
  return rows.map((r) => toRow(r as Record<string, unknown>));
}

async function one(sql: Sql, id: string) {
  const r = (await sql.query(`select ${COLS} ${FROM} where c.id = $1`, [id]))[0];
  if (!r) throw new Error("Commission not found.");
  return toRow(r as Record<string, unknown>);
}

/** Admin: owner paid (by the Razorpay link or otherwise). */
export async function markCommissionPaid(sql: Sql, id: string, adminId: string, paidOn: string, ref: string) {
  const c = await one(sql, id);
  if (!canMarkPaid(c.status)) throw new Error(`Only a due commission can be marked paid (this one is ${c.status}).`);
  if (paidOn < c.moveInOn) throw new Error("Paid date can't be before the move-in.");
  const r = await sql<{ id: string }>`update owner_commissions set status = 'paid', paid_on = ${paidOn}::date, paid_ref = ${ref}, paid_recorded_by = ${adminId}, updated_at = now() where id = ${id} and status = 'due' returning id`;
  if (!r.length) throw new Error("Someone else changed this commission. Reload.");
  return one(sql, id);
}

/** Admin: tenant left within 15 days of moving in → 50% of what the owner paid goes back. */
export async function recordCommissionRefund(sql: Sql, id: string, adminId: string, d: { vacatedOn: string; refundedOn: string; ref: string }) {
  const c = await one(sql, id);
  if (!canRefund50(c.status)) throw new Error(`Only a paid commission can get the 50% refund (this one is ${c.status}).`);
  if (!refundEligible(c.moveInOn, d.vacatedOn)) throw new Error(`The tenant moved out more than 15 days after moving in (${c.moveInOn}), so there's no refund.`);
  const amount = refundInr(c.totalInr);
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
