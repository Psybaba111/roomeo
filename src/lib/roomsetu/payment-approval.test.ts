// Admin UPI approval is one transaction (QA review Q2). PGlite, ZZ TEST data only.
import test from "node:test";
import assert from "node:assert/strict";
import { testDb, seedListing } from "./pgtest.ts";
import { approveUpiPayment, rejectUpiPayment } from "./payment-approval.ts";
import { withSavepoint, withTransaction } from "../tx.ts";
import type { Sql } from "../db.ts";

async function setup() {
  const { pg, sql } = await testDb();
  await seedListing(pg, "L1", "owner");
  await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, utr)
    values ('11111111-aaaa-4bbb-8ccc-000000000001','owner','ZZ TEST boost',99,'SUBMITTED','UPI','RMZZ1','BOOST','L1','123456789012')`);
  const count = async (q: string) => Number((await pg.query<{ n: number }>(q)).rows[0].n);
  return { pg, sql, count, id: "11111111-aaaa-4bbb-8ccc-000000000001" };
}
const good = {
  unlock: async (tx: Sql, id: string) => { await tx.query(`insert into notifications (id, user_id, kind, title, body, href) values ($1,'owner','payment','ZZ unlocked',$2,'/')`, [crypto.randomUUID(), id]); },
  apply: async (tx: Sql) => { await tx.query(`update listings set boosted_until = now() + interval '7 days' where id = 'L1'`, []); },
};

test("a failure part-way through the effects rolls EVERYTHING back (payment stays SUBMITTED, nothing applied)", async () => {
  const { sql, count, id } = await setup();
  const failing = { unlock: good.unlock, apply: async (tx: Sql) => { await good.apply(tx); throw new Error("boom: invoice insert failed"); } };
  await assert.rejects(approveUpiPayment(sql, { paymentId: id, adminId: "zz-admin" }, failing), /boom/);
  assert.equal(await count(`select count(*)::int n from payments where id = '${id}' and status = 'SUBMITTED' and reviewed_by is null`), 1);
  assert.equal(await count(`select count(*)::int n from audit_log where target_id = '${id}'`), 0);
  assert.equal(await count(`select count(*)::int n from notifications where title = 'ZZ unlocked'`), 0);
  assert.equal(await count(`select count(*)::int n from listings where id = 'L1' and boosted_until is not null`), 0);
});

test("retry after the failure applies everything once; approving again is a safe no-op", async () => {
  const { sql, count, id } = await setup();
  await assert.rejects(approveUpiPayment(sql, { paymentId: id, adminId: "zz-admin" }, { unlock: good.unlock, apply: async () => { throw new Error("boom"); } }));
  const r1 = await approveUpiPayment(sql, { paymentId: id, adminId: "zz-admin" }, good);
  assert.deepEqual(r1, { approved: true, already: false });
  assert.equal(await count(`select count(*)::int n from payments where id = '${id}' and status = 'PAID' and reviewed_by = 'zz-admin'`), 1);
  assert.equal(await count(`select count(*)::int n from audit_log where target_id = '${id}' and action = 'payment.approve'`), 1);
  assert.equal(await count(`select count(*)::int n from notifications where title = 'ZZ unlocked'`), 1);
  let calls = 0;
  const spy = { unlock: async () => { calls++; }, apply: async () => { calls++; } };
  const r2 = await approveUpiPayment(sql, { paymentId: id, adminId: "zz-admin-2" }, spy);
  assert.deepEqual(r2, { approved: false, already: true });
  assert.equal(calls, 0, "effects never run twice");
  assert.equal(await count(`select count(*)::int n from audit_log where target_id = '${id}'`), 1);
  assert.equal(await count(`select count(*)::int n from payments where id = '${id}' and reviewed_by = 'zz-admin'`), 1, "first reviewer kept");
});

test("a rejected payment can't be approved; reject is one transaction too", async () => {
  const { sql, count, id } = await setup();
  await assert.rejects(rejectUpiPayment(sql, { paymentId: id, adminId: "zz-admin" }, async () => { throw new Error("restore failed"); }), /restore failed/);
  assert.equal(await count(`select count(*)::int n from payments where id = '${id}' and status = 'SUBMITTED'`), 1, "rolled back");
  await rejectUpiPayment(sql, { paymentId: id, adminId: "zz-admin" }, async () => undefined);
  assert.equal(await count(`select count(*)::int n from audit_log where target_id = '${id}' and action = 'payment.reject'`), 1);
  await assert.rejects(approveUpiPayment(sql, { paymentId: id, adminId: "zz-admin" }, good), /Already reviewed/);
  await assert.rejects(rejectUpiPayment(sql, { paymentId: id, adminId: "zz-admin" }, async () => undefined), /Already reviewed/);
});

test("a caught failure inside withSavepoint doesn't abort the surrounding transaction", async () => {
  const { pg, sql } = await setup();
  await withTransaction(sql, async (tx) => {
    await tx`update listings set title = 'ZZ kept' where id = 'L1'`;
    await withSavepoint(tx, async (t) => { await t`insert into no_such_table values (1)`; }).catch(() => undefined);
    await tx`update listings set deposit = 1234 where id = 'L1'`;
  });
  const row = (await pg.query<{ title: string; deposit: number }>(`select title, deposit from listings where id = 'L1'`)).rows[0];
  assert.equal(row.title, "ZZ kept");
  assert.equal(Number(row.deposit), 1234);
});
