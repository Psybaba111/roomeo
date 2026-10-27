// Exercises migration 0005 and the payment SQL against an in-memory PGlite.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dir = new URL("../../../migrations/", import.meta.url);

async function db() {
  const pg = new PGlite();
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(new URL(f, dir), "utf8"));
  }
  return pg;
}

const PLAN = "00000000-0000-4000-8000-000000000bb9";
const insertPending = (pg: PGlite, id: string, user: string, ref: string) =>
  pg.query(
    `insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, plan_id)
     values ($1,$2,'Premium listing',499,'PENDING','UPI',$3,$4) on conflict do nothing returning id`,
    [id, user, ref, PLAN],
  );

test("one open UPI checkout per user and plan; utr unique; approve activates atomically", async () => {
  const pg = await db();
  assert.equal((await insertPending(pg, "p1", "u1", "RMAAAAAAAA")).rows.length, 1);
  assert.equal((await insertPending(pg, "p2", "u1", "RMBBBBBBBB")).rows.length, 0, "idempotent");
  assert.equal((await insertPending(pg, "p3", "u2", "RMCCCCCCCC")).rows.length, 1);

  await pg.query(`update payments set utr='412345678901', status='SUBMITTED' where id='p1'`);
  await assert.rejects(pg.query(`update payments set utr='412345678901', status='SUBMITTED' where id='p3'`), /payments_utr_key/);

  const approve = `with paid as (
      update payments set status = 'PAID', reviewed_by = $2, reviewed_at = now()
      where id = $1 and provider = 'UPI' and status = 'SUBMITTED' returning id, user_id, plan_id
    ), sub as (
      insert into subscriptions (id, user_id, plan_id, status, payment_id, activated_at)
      select $3, user_id, plan_id, 'ACTIVE', id, now() from paid returning id
    ), logged as (
      insert into audit_log (id, actor_id, action, target_type, target_id, detail)
      select $4, $2, 'payment.approve', 'payment', id, 'subscription ' || $3 from paid
    ) select id from paid`;
  assert.equal((await pg.query(approve, ["p1", "admin", "s1", "a1"])).rows.length, 1);
  assert.equal((await pg.query(approve, ["p1", "admin", "s2", "a2"])).rows.length, 0, "no double approve");
  const sub = await pg.query<{ status: string; payment_id: string }>(`select status, payment_id from subscriptions where user_id='u1'`);
  assert.deepEqual(sub.rows, [{ status: "ACTIVE", payment_id: "p1" }]);
  // After PAID, a fresh checkout for the same plan is allowed again.
  assert.equal((await insertPending(pg, "p4", "u1", "RMDDDDDDDD")).rows.length, 1);
  await pg.close();
});
