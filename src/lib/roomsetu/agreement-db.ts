import type { Sql } from "../db.ts";
import { refundableOnCancel } from "./deal-agreement.ts";

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
export async function cancelAgreement(sql: Sql, p: { applicationId: string; userId: string; reason: string; now?: Date }) {
  const a = await loadAgreement(sql, p.applicationId);
  if (!a || (p.userId !== a.seeker_id && p.userId !== a.owner_id)) throw new Error("Agreement not found.");
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
