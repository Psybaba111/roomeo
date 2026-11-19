// Admin review of a UPI (UTR) payment as ONE transaction (QA review Q2, 19 Nov 2026).
// Marking PAID, the subscription, the audit row, the contact unlock and the paid-payment effects
// (passes, boosts, fast track, trial confirm, success-fee invoice) commit together or not at all.
// Pure SQL with relative imports so node tests can run it; the effects are passed in by admin-api.ts.
import type { Sql } from "../db.ts";
import { withTransaction } from "../tx.ts";

export type ApprovalEffects = {
  /** Contact-fee payments unlock messaging with the owner (squad-api unlockFromPayment). */
  unlock: (sql: Sql, paymentId: string) => Promise<unknown>;
  /** Passes, boosts, fast track, trial confirm, success-fee invoice (pricing-db applyPaidPayment). */
  apply: (sql: Sql, paymentId: string) => Promise<unknown>;
};

export type ApprovalResult = { approved: boolean; already: boolean };

/**
 * Approve a SUBMITTED UPI payment. A failure anywhere rolls everything back, so the payment stays
 * SUBMITTED and the admin can simply approve again. Approving a payment that is already PAID is a
 * safe no-op ({ already: true }); effects are never applied twice. A REJECTED or never-submitted
 * payment is refused.
 */
export async function approveUpiPayment(sql: Sql, d: { paymentId: string; adminId: string }, effects: ApprovalEffects): Promise<ApprovalResult> {
  return withTransaction(sql, async (tx) => {
    const subId = crypto.randomUUID();
    const rows = await tx.query<{ id: string }>(
      `with paid as (
         update payments set status = 'PAID', reviewed_by = $2, reviewed_at = now()
         where id = $1 and provider = 'UPI' and status = 'SUBMITTED'
         returning id, user_id, plan_id
       ), sub as (
         insert into subscriptions (id, user_id, plan_id, status, payment_id, activated_at)
         select $3, user_id, plan_id, 'ACTIVE', id, now() from paid where plan_id is not null
         returning id
       ), logged as (
         insert into audit_log (id, actor_id, action, target_type, target_id, detail)
         select $4, $2, 'payment.approve', 'payment', id, 'subscription ' || $3 from paid
       )
       select id from paid`,
      [d.paymentId, d.adminId, subId, crypto.randomUUID()],
    );
    if (!rows.length) {
      const cur = (await tx.query<{ status: string }>(`select status from payments where id = $1`, [d.paymentId]))[0];
      if (cur?.status === "PAID") return { approved: false, already: true };
      throw new Error("Already reviewed.");
    }
    await effects.unlock(tx, d.paymentId);
    await effects.apply(tx, d.paymentId);
    return { approved: true, already: false };
  });
}

/** Reject a SUBMITTED UPI payment and give back any Roomeo credit used on it, in one transaction. */
export async function rejectUpiPayment(sql: Sql, d: { paymentId: string; adminId: string }, restore: (sql: Sql, paymentId: string) => Promise<unknown>): Promise<void> {
  await withTransaction(sql, async (tx) => {
    const rows = await tx.query<{ id: string }>(`update payments set status = 'REJECTED', reviewed_by = $2, reviewed_at = now()
      where id = $1 and provider = 'UPI' and status = 'SUBMITTED' returning id`, [d.paymentId, d.adminId]);
    if (!rows.length) throw new Error("Already reviewed.");
    await tx.query(`insert into audit_log (id, actor_id, action, target_type, target_id, detail) values ($1, $2, 'payment.reject', 'payment', $3, '')`, [crypto.randomUUID(), d.adminId, d.paymentId]);
    await restore(tx, d.paymentId);
  });
}
