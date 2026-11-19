// Referral fee credits ledger. Pure SQL with relative imports so it runs under node tests (PGlite).
import type { Sql } from "../db.ts";
import { allocateCredits, feeCreditConfig, restorePlan, statusFor, type FeeCreditConfig, type FeeKind, type OpenCredit } from "./fee-credits.ts";

export type CreditEvent = { entity: "credit" | "deposit_mark" | "owner_fee" | "tenant_fee"; entityId: string; action: string; actorId: string; userId?: string | null; amountInr?: number | null; note?: string };

/** Append-only audit trail (fee_credit_events). */
export async function creditEvent(sql: Sql, e: CreditEvent): Promise<void> {
  await sql.query(`insert into fee_credit_events (id, entity, entity_id, action, actor_id, user_id, amount_inr, note)
    values ($1, $2, $3, $4, $5, $6, $7, $8)`, [crypto.randomUUID(), e.entity, e.entityId, e.action, e.actorId, e.userId ?? null, e.amountInr ?? null, (e.note ?? "").slice(0, 300)]);
}

/** True once migration 0032's ledger is on this database. */
export async function feeCreditsReady(sql: Sql): Promise<boolean> {
  const r = await sql.query<{ ok: boolean }>(`select (to_regclass('public.fee_credit_applications') is not null
    and exists (select 1 from information_schema.columns where table_name = 'referral_credits' and column_name = 'kind')) as ok`, []);
  return Boolean(r[0]?.ok);
}

export type CreditRow = {
  id: string; userId: string; userName: string; amountInr: number; usedInr: number; remainingInr: number; status: string; reason: string;
  referralId: string; referrerId: string; referrerName: string; friendId: string; friendName: string; issuedBy: string; note: string;
  createdAt: string; appliedAt: string | null; voidedAt: string | null; voidedBy: string | null; voidReason: string;
};

const CREDIT_SELECT = `select c.id, c.user_id, coalesce(up.full_name, u.email, c.user_id) as user_name, c.amount_inr,
    coalesce((select sum(a.amount_inr) from fee_credit_applications a where a.credit_id = c.id), 0)::int as used_inr,
    c.status, c.reason, c.referral_id, coalesce(c.referrer_id, '') as referrer_id, coalesce(rp.full_name, ru.email, c.referrer_id, '') as referrer_name,
    coalesce(c.friend_id, '') as friend_id, coalesce(fp.full_name, fu.email, c.friend_id, '') as friend_name, coalesce(c.issued_by, '') as issued_by, c.note,
    c.created_at::text as created_at, c.applied_at::text as applied_at, c.voided_at::text as voided_at, c.voided_by, c.void_reason
  from referral_credits c
  left join profiles up on up.user_id = c.user_id left join "user" u on u.id = c.user_id
  left join profiles rp on rp.user_id = c.referrer_id left join "user" ru on ru.id = c.referrer_id
  left join profiles fp on fp.user_id = c.friend_id left join "user" fu on fu.id = c.friend_id
  where c.kind = 'fee_credit'`;

function toCredit(r: Record<string, unknown>): CreditRow {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const amount = Number(r.amount_inr ?? 0);
  const used = Number(r.used_inr ?? 0);
  return {
    id: s(r.id), userId: s(r.user_id), userName: s(r.user_name), amountInr: amount, usedInr: used, remainingInr: s(r.status) === "void" ? 0 : Math.max(0, amount - used),
    status: s(r.status), reason: s(r.reason), referralId: s(r.referral_id), referrerId: s(r.referrer_id), referrerName: s(r.referrer_name), friendId: s(r.friend_id),
    friendName: s(r.friend_name), issuedBy: s(r.issued_by), note: s(r.note), createdAt: s(r.created_at), appliedAt: r.applied_at == null ? null : s(r.applied_at),
    voidedAt: r.voided_at == null ? null : s(r.voided_at), voidedBy: r.voided_by == null ? null : s(r.voided_by), voidReason: s(r.void_reason),
  };
}

export async function listCredits(sql: Sql, userId?: string): Promise<CreditRow[]> {
  const rows = userId
    ? await sql.query(`${CREDIT_SELECT} and c.user_id = $1 order by c.created_at desc limit 200`, [userId])
    : await sql.query(`${CREDIT_SELECT} order by c.created_at desc limit 500`, []);
  return rows.map((r) => toCredit(r as Record<string, unknown>));
}

async function oneCredit(sql: Sql, id: string): Promise<CreditRow> {
  const r = (await sql.query(`${CREDIT_SELECT} and c.id = $1`, [id]))[0];
  if (!r) throw new Error("Credit not found.");
  return toCredit(r as Record<string, unknown>);
}

/** Open (usable) credits for a user, oldest first. */
export async function openCredits(sql: Sql, userId: string): Promise<OpenCredit[]> {
  return (await listCredits(sql, userId)).filter((c) => c.status === "issued" && c.remainingInr > 0).map((c) => ({ id: c.id, remainingInr: c.remainingInr, createdAt: c.createdAt }));
}

/** What the user can still use. Missing tables → 0. */
export async function creditBalance(sql: Sql, userId: string): Promise<number> {
  if (!(await feeCreditsReady(sql))) return 0;
  return (await openCredits(sql, userId)).reduce((n, c) => n + c.remainingInr, 0);
}

/** Pairs counted against the cap: referral pairs with at least one credit that isn't void. */
export async function pairsUsed(sql: Sql): Promise<number> {
  const r = await sql.query<{ n: number }>(`select count(distinct referral_id)::int as n from referral_credits where kind = 'fee_credit' and status <> 'void'`, []);
  return Number(r[0]?.n ?? 0);
}

export async function programmeStatus(sql: Sql, cfg: FeeCreditConfig = feeCreditConfig()) {
  const ready = await feeCreditsReady(sql);
  if (!ready) return { ...cfg, ready, pairsUsed: 0, outstandingInr: 0, credits: 0 };
  const all = await listCredits(sql);
  return { ...cfg, ready, pairsUsed: await pairsUsed(sql), outstandingInr: all.reduce((n, c) => n + c.remainingInr, 0), credits: all.length };
}

async function resolveUser(sql: Sql, ref: string, label: string): Promise<string> {
  const v = ref.trim();
  if (!v) throw new Error(`Enter the ${label}'s email or user id.`);
  const r = (await sql.query<{ id: string }>(`select id from "user" where id = $1 or lower(email) = lower($2) limit 2`, [v, v]));
  if (r.length !== 1) throw new Error(`No single account matches the ${label} (${v}).`);
  return r[0].id;
}

/**
 * Admin: issue the pair's two credits (one to the referrer, one to the friend) after the friend has moved in and
 * paid their first month. Links to (or creates) the 0017 referrals row for the pair. Refuses past the cap, while
 * the kill switch is off, or if the pair already has credits (legacy ₹500 ones included).
 */
export async function issuePairCredits(sql: Sql, adminId: string, d: { referrer: string; friend: string; note?: string }, cfg: FeeCreditConfig = feeCreditConfig()): Promise<CreditRow[]> {
  if (!cfg.enabled) throw new Error("Referral credits are switched off (ROOMEO_REFERRAL_CREDITS_ENABLED). Nothing was issued.");
  if (!(await feeCreditsReady(sql))) throw new Error("The credits ledger isn't set up on this database yet (migration 0032). Nothing was issued.");
  const referrerId = await resolveUser(sql, d.referrer, "referrer");
  const friendId = await resolveUser(sql, d.friend, "friend");
  if (referrerId === friendId) throw new Error("The referrer and the friend are the same account.");
  const used = await pairsUsed(sql);
  if (used >= cfg.pairsCap) throw new Error(`The programme cap is reached (${used} of ${cfg.pairsCap} pairs). Void a pair or raise ROOMEO_REFERRAL_CREDIT_PAIRS_CAP.`);
  let ref = (await sql.query<{ id: string; referrer_id: string }>(`select id, referrer_id from referrals where referee_id = $1`, [friendId]))[0];
  if (ref && ref.referrer_id !== referrerId) throw new Error("That friend is already linked to a different referrer. Nothing was issued.");
  const reverse = (await sql.query<{ id: string }>(`select id from referrals where referee_id = $1 and referrer_id = $2`, [referrerId, friendId]))[0];
  if (reverse) throw new Error("These two are already a pair the other way round. Nothing was issued.");
  if (!ref) {
    const code = (await sql.query<{ code: string }>(`select code from referral_codes where user_id = $1`, [referrerId]))[0]?.code ?? "MANUAL";
    const id = crypto.randomUUID();
    await sql.query(`insert into referrals (id, referrer_id, referee_id, code, completed_at) values ($1, $2, $3, $4, now()) on conflict (referee_id) do nothing`, [id, referrerId, friendId, code]);
    ref = (await sql.query<{ id: string; referrer_id: string }>(`select id, referrer_id from referrals where referee_id = $1`, [friendId]))[0];
    if (!ref || ref.referrer_id !== referrerId) throw new Error("That friend was just linked to someone else. Reload.");
  } else {
    await sql.query(`update referrals set completed_at = coalesce(completed_at, now()) where id = $1`, [ref.id]);
  }
  const have = await sql.query<{ id: string }>(`select id from referral_credits where referral_id = $1`, [ref.id]);
  if (have.length) throw new Error("This pair already has credits (check the list, including old ₹500 rent credits). Nothing was issued.");
  const note = (d.note ?? "").trim().slice(0, 200);
  const rows = [
    { userId: referrerId, reason: "Referral: your friend moved in" },
    { userId: friendId, reason: "Referral: you joined with a friend's invite" },
  ];
  const ids: string[] = [];
  for (const r of rows) {
    const id = crypto.randomUUID();
    await sql.query(`insert into referral_credits (id, user_id, referral_id, amount_inr, reason, status, kind, referrer_id, friend_id, issued_by, note)
      values ($1, $2, $3, $4, $5, 'issued', 'fee_credit', $6, $7, $8, $9)`, [id, r.userId, ref.id, cfg.amountInr, r.reason, referrerId, friendId, adminId, note]);
    await creditEvent(sql, { entity: "credit", entityId: id, action: "issued", actorId: adminId, userId: r.userId, amountInr: cfg.amountInr, note: note || r.reason });
    await sql.query(`insert into notifications (id, user_id, kind, title, body, href) values ($1, $2, 'application', $3,
      $4, '/dashboard')`, [crypto.randomUUID(), r.userId, `₹${cfg.amountInr} Roomeo credit`, "Thanks for bringing a friend. It comes off your next Roomeo fee automatically. It isn't cash."]);
    ids.push(id);
  }
  return Promise.all(ids.map((id) => oneCredit(sql, id)));
}

/** Admin: void a credit. Any part already used on a fee stays used; the rest can't be used any more. */
export async function voidCredit(sql: Sql, adminId: string, creditId: string, reason: string): Promise<CreditRow> {
  const why = reason.trim().slice(0, 200);
  if (!why) throw new Error("Say why you're voiding this credit.");
  if (!(await feeCreditsReady(sql))) throw new Error("The credits ledger isn't set up on this database yet (migration 0032). Nothing was changed.");
  const c = await oneCredit(sql, creditId);
  if (c.status === "void") throw new Error("Already void.");
  if (c.status === "applied") throw new Error("This credit is fully used on a fee. Void the fee's deposit mark or record the refund instead.");
  const r = await sql.query<{ id: string }>(`update referral_credits set status = 'void', voided_at = now(), voided_by = $1, void_reason = $2, updated_at = now()
    where id = $3 and status = 'issued' returning id`, [adminId, why, creditId]);
  if (!r.length) throw new Error("Someone else changed this credit. Reload.");
  await creditEvent(sql, { entity: "credit", entityId: creditId, action: "voided", actorId: adminId, userId: c.userId, amountInr: c.remainingInr, note: why });
  return oneCredit(sql, creditId);
}

async function refreshStatus(sql: Sql, creditId: string): Promise<void> {
  const c = await oneCredit(sql, creditId);
  if (c.status === "void") return;
  const next = statusFor(c.amountInr, c.usedInr);
  if (next !== c.status) await sql.query(`update referral_credits set status = $1, applied_at = $2::timestamptz, updated_at = now() where id = $3`, [next, next === "applied" ? new Date().toISOString() : null, creditId]);
}

/** Net credit currently applied to one fee. */
export async function netAppliedForFee(sql: Sql, feeKind: FeeKind, feeId: string): Promise<number> {
  const r = await sql.query<{ n: number }>(`select coalesce(sum(amount_inr), 0)::int as n from fee_credit_applications where fee_kind = $1 and fee_id = $2`, [feeKind, feeId]);
  return Number(r[0]?.n ?? 0);
}

/**
 * Apply the user's open credits to a new fee (oldest first, never more than the fee). Idempotent per fee: a fee
 * that already has credit applied gets nothing more. Off (kill switch) or no ledger → 0. Returns ₹ applied.
 */
export async function applyCreditsToFee(sql: Sql, d: { userId: string; feeKind: FeeKind; feeId: string; feeInr: number; actorId?: string }, cfg: FeeCreditConfig = feeCreditConfig()): Promise<number> {
  if (!cfg.enabled || !(d.feeInr > 0)) return 0;
  if (!(await feeCreditsReady(sql))) return 0;
  const already = await sql.query<{ id: string }>(`select id from fee_credit_applications where fee_kind = $1 and fee_id = $2 limit 1`, [d.feeKind, d.feeId]);
  if (already.length) return netAppliedForFee(sql, d.feeKind, d.feeId);
  let total = 0;
  for (const a of allocateCredits(d.feeInr, await openCredits(sql, d.userId))) {
    await sql.query(`insert into fee_credit_applications (id, credit_id, user_id, fee_kind, fee_id, amount_inr, note) values ($1, $2, $3, $4, $5, $6, 'applied')`, [crypto.randomUUID(), a.creditId, d.userId, d.feeKind, d.feeId, a.amountInr]);
    await refreshStatus(sql, a.creditId);
    await creditEvent(sql, { entity: "credit", entityId: a.creditId, action: "applied", actorId: d.actorId ?? "system", userId: d.userId, amountInr: a.amountInr, note: `${d.feeKind} ${d.feeId}` });
    total += a.amountInr;
  }
  return total;
}

/**
 * Put credit back from a fee that was voided, refunded or halved. `amountInr` omitted = everything applied to it.
 * Always allowed (even with the kill switch off): restoring is never a payout. Returns ₹ restored.
 */
export async function restoreCreditsForFee(sql: Sql, d: { feeKind: FeeKind; feeId: string; amountInr?: number; actorId: string; reason: string }): Promise<number> {
  if (!(await feeCreditsReady(sql))) return 0;
  const per = await sql.query<{ credit_id: string; user_id: string; net: number; at: string }>(`select credit_id, min(user_id) as user_id, sum(amount_inr)::int as net, max(created_at)::text as at
    from fee_credit_applications where fee_kind = $1 and fee_id = $2 group by credit_id`, [d.feeKind, d.feeId]);
  const netTotal = per.reduce((n, p) => n + Number(p.net), 0);
  const want = d.amountInr == null ? netTotal : Math.min(netTotal, Math.max(0, Math.floor(d.amountInr)));
  let total = 0;
  for (const p of restorePlan(per.map((x) => ({ creditId: x.credit_id, netInr: Number(x.net), at: x.at })), want)) {
    const userId = per.find((x) => x.credit_id === p.creditId)?.user_id ?? null;
    await sql.query(`insert into fee_credit_applications (id, credit_id, user_id, fee_kind, fee_id, amount_inr, note) values ($1, $2, $3, $4, $5, $6, $7)`, [crypto.randomUUID(), p.creditId, userId, d.feeKind, d.feeId, -p.amountInr, d.reason.slice(0, 200)]);
    await refreshStatus(sql, p.creditId);
    await creditEvent(sql, { entity: "credit", entityId: p.creditId, action: "restored", actorId: d.actorId, userId, amountInr: p.amountInr, note: `${d.feeKind} ${d.feeId}: ${d.reason}` });
    total += p.amountInr;
  }
  return total;
}

/**
 * Tenant (or legacy owner) success fee: apply credit to a just-created PENDING payment. Fully covered → the
 * payment is PAID at once by credit (provider CREDIT, no UPI, no invoice). Returns ₹ applied.
 */
export async function applyCreditsToPayment(sql: Sql, paymentId: string, cfg: FeeCreditConfig = feeCreditConfig()): Promise<number> {
  const p = (await sql.query<{ user_id: string; amount_inr: number; status: string }>(`select user_id, amount_inr, status from payments where id = $1`, [paymentId]))[0];
  if (!p || p.status !== "PENDING") return 0;
  const applied = await applyCreditsToFee(sql, { userId: p.user_id, feeKind: "tenant_fee", feeId: paymentId, feeInr: Number(p.amount_inr) }, cfg);
  if (applied <= 0) return 0;
  const left = Number(p.amount_inr) - applied;
  if (left <= 0) {
    await sql.query(`update payments set amount_inr = 0, credit_applied_inr = $1, status = 'PAID', provider = 'CREDIT', reviewed_at = now(),
      purpose = purpose || $2 where id = $3`, [applied, ` · ₹${applied} Roomeo credit applied (paid in full by credit)`, paymentId]);
  } else {
    await sql.query(`update payments set amount_inr = $1, credit_applied_inr = $2, purpose = purpose || $3 where id = $4`, [left, applied, ` · less ₹${applied} Roomeo credit`, paymentId]);
  }
  await creditEvent(sql, { entity: "tenant_fee", entityId: paymentId, action: "credit_applied", actorId: "system", userId: p.user_id, amountInr: applied, note: left <= 0 ? "paid in full by credit" : `₹${left} left to pay` });
  return applied;
}

export async function recentCreditEvents(sql: Sql, limit = 100) {
  return sql.query<{ id: string; entity: string; entity_id: string; action: string; actor_id: string; user_id: string | null; amount_inr: number | null; note: string; created_at: string }>(`
    select id, entity, entity_id, action, actor_id, user_id, amount_inr, note, created_at::text as created_at from fee_credit_events order by created_at desc limit $1`, [limit]);
}
