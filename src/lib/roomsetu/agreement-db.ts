import type { Sql } from "../db.ts";
import { refundableOnCancel } from "./deal-agreement.ts";
import { invoiceAmounts, invoiceNumber, stateForCity } from "./invoice.ts";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export async function loadAgreement(sql: Sql, applicationId: string) {
  const rows = await sql.query<Row>(
    `select id, application_id, listing_id, seeker_id, owner_id, body, seeker_signed_at::text as seeker_signed_at, seeker_name,
            owner_signed_at::text as owner_signed_at, owner_name, issued_at::text as issued_at, cancelled_at::text as cancelled_at, cancelled_by
       from deal_agreements where application_id = $1`,
    [applicationId],
  );
  return rows[0] ?? null;
}

/** Records one side's signature (name, time, IP). Issues the agreement when both have signed. */
export async function signAgreement(sql: Sql, p: { applicationId: string; userId: string; name: string; ip: string }) {
  const a = await loadAgreement(sql, p.applicationId);
  if (!a) throw new Error("Agreement not found.");
  if (a.cancelled_at) throw new Error("This agreement was cancelled.");
  if (p.userId === a.seeker_id) {
    await sql.query(`update deal_agreements set seeker_signed_at = coalesce(seeker_signed_at, now()), seeker_name = coalesce(seeker_name, $2), seeker_ip = coalesce(seeker_ip, $3) where id = $1`, [a.id, p.name, p.ip]);
  } else if (p.userId === a.owner_id) {
    await sql.query(`update deal_agreements set owner_signed_at = coalesce(owner_signed_at, now()), owner_name = coalesce(owner_name, $2), owner_ip = coalesce(owner_ip, $3) where id = $1`, [a.id, p.name, p.ip]);
  } else throw new Error("That agreement is not yours.");
  await sql.query(`update deal_agreements set issued_at = now() where id = $1 and issued_at is null and seeker_signed_at is not null and owner_signed_at is not null and cancelled_at is null`, [a.id]);
  return loadAgreement(sql, p.applicationId);
}

/**
 * Either side cancels. Within 7 days of issue every PAID success fee on this agreement (both sides)
 * becomes REFUND_DUE for the admin UPI refund flow; unpaid checkouts are closed. After 7 days, no refund.
 */
export async function cancelAgreement(sql: Sql, p: { applicationId: string; userId: string; reason: string; now?: Date; parties?: string[] }) {
  const a = await loadAgreement(sql, p.applicationId);
  const allowed = p.parties ?? [s(a?.seeker_id), s(a?.owner_id)];
  if (!a || !allowed.includes(p.userId)) throw new Error("Agreement not found.");
  if (a.cancelled_at) return { refunds: 0, refundable: false };
  const refundable = refundableOnCancel(s(a.issued_at) || null, p.now ?? new Date());
  await sql.query(`update deal_agreements set cancelled_at = now(), cancelled_by = $2, cancel_reason = $3 where id = $1`, [a.id, p.userId, p.reason.slice(0, 300)]);
  await sql.query(`update payments set status = 'CANCELLED' where agreement_id = $1 and kind = 'SUCCESS_FEE' and status = 'PENDING'`, [a.id]);
  let refunds = 0;
  if (refundable) {
    const r = await sql.query<Row>(
      `update payments set status = 'REFUND_DUE', refund_due_at = now(), refund_reason = 'Agreement cancelled within 7 days of issue.'
        where agreement_id = $1 and kind = 'SUCCESS_FEE' and status in ('PAID','SUBMITTED') returning user_id`,
      [a.id],
    );
    refunds = r.length;
  }
  return { refunds, refundable };
}

/** Squad agreements live under application_id = "squad:<requestId>". */
export const squadAgreementKey = (requestId: string) => `squad:${requestId}`;

export async function squadSigners(sql: Sql, agreementId: string) {
  return sql.query<{ user_id: string; role: string; name: string; signed_at: string }>(
    `select user_id, role, name, signed_at::text as signed_at from deal_agreement_signers where agreement_id = $1 order by signed_at`, [agreementId]);
}

/** One squad member or the owner signs. Issued once the owner and every active member have signed. */
export async function signSquadAgreement(sql: Sql, p: { requestId: string; userId: string; ownerId: string; memberIds: string[]; name: string; ip: string }) {
  const a = await loadAgreement(sql, squadAgreementKey(p.requestId));
  if (!a) throw new Error("Agreement not found.");
  if (a.cancelled_at) throw new Error("This agreement was cancelled.");
  const isOwner = p.userId === p.ownerId;
  if (!isOwner && !p.memberIds.includes(p.userId)) throw new Error("That agreement is not yours.");
  await sql.query(`insert into deal_agreement_signers (agreement_id, user_id, role, name, ip) values ($1,$2,$3,$4,$5) on conflict do nothing`, [a.id, p.userId, isOwner ? "OWNER" : "TENANT", p.name, p.ip]);
  if (isOwner) await sql.query(`update deal_agreements set owner_signed_at = coalesce(owner_signed_at, now()), owner_name = coalesce(owner_name, $2), owner_ip = coalesce(owner_ip, $3) where id = $1`, [a.id, p.name, p.ip]);
  const signed = (await squadSigners(sql, s(a.id))).map((r) => r.user_id);
  if (signed.includes(p.ownerId) && p.memberIds.length > 0 && p.memberIds.every((m) => signed.includes(m))) {
    await sql.query(`update deal_agreements set issued_at = now(), seeker_signed_at = coalesce(seeker_signed_at, now()) where id = $1 and issued_at is null and cancelled_at is null`, [a.id]);
  }
  return loadAgreement(sql, squadAgreementKey(p.requestId));
}

/** Creates the GST invoice for a PAID success-fee payment. Idempotent (one per payment). */
export async function createFeeInvoice(sql: Sql, paymentId: string, baseInr: number, now: Date = new Date()) {
  const existing = await sql.query<Row>(`select id, number from fee_invoices where payment_id = $1`, [paymentId]);
  if (existing[0]) return existing[0];
  const pay = (await sql.query<Row>(
    `select p.user_id, p.amount_inr, p.agreement_id, p.kind, p.status, pr.full_name, pr.city from payments p left join profiles pr on pr.user_id = p.user_id where p.id = $1`, [paymentId]))[0];
  if (!pay || s(pay.kind) !== "SUCCESS_FEE" || s(pay.status) !== "PAID") return null;
  const buyerState = stateForCity(s(pay.city));
  const amt = invoiceAmounts(baseInr, buyerState, Number(pay.amount_inr));
  const seq = Number((await sql.query<{ n: string }>(`select nextval('fee_invoice_seq')::text as n`))[0].n);
  const number = invoiceNumber(seq, now);
  const id = crypto.randomUUID();
  await sql.query(
    `insert into fee_invoices (id, number, payment_id, user_id, agreement_id, issued_at, buyer_name, buyer_state, place_of_supply, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, round_off_paise, paid_inr)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) on conflict (payment_id) do nothing`,
    [id, number, paymentId, s(pay.user_id), s(pay.agreement_id) || null, now.toISOString(), s(pay.full_name) || "Roomeo user", buyerState, amt.placeOfSupply, amt.taxable, amt.cgst, amt.sgst, amt.igst, amt.total, amt.roundOff, Number(pay.amount_inr)],
  );
  return (await sql.query<Row>(`select id, number from fee_invoices where payment_id = $1`, [paymentId]))[0];
}
