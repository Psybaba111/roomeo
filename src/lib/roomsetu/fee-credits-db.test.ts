// Referral credits ledger + owner fee after the deposit mark (migration 0032). PGlite, ZZ TEST data only.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { testDb, migrationsDir } from "./pgtest.ts";
import { feeCreditConfig } from "./fee-credits.ts";
import { applyCreditsToPayment, creditBalance, issuePairCredits, listCredits, pairsUsed, restoreCreditsForFee, voidCredit, recentCreditEvents } from "./fee-credits-db.ts";
import { allCommissions, markDepositReceived, undoDepositMark, recordEarlyExit, recordCommissionRefund, markCommissionPaid, setFoundingPartner, createCommissionForMoveIn } from "./owner-fee-db.ts";
import { createFeeInvoice } from "./agreement-db.ts";
import { istYmd, addDays } from "./owner-fee.ts";

const ON = feeCreditConfig({ ROOMEO_REFERRAL_CREDITS_ENABLED: "true" });
const KEYS = ["OWNER_FEE_ENABLED", "OWNER_FEE_GST_ENABLED", "ROOMEO_REFERRAL_CREDITS_ENABLED", "ROOMEO_REFERRAL_CREDIT_INR", "ROOMEO_TENANT_FEE_ENABLED", "ROOMEO_FEE_ENABLED"];
async function withEnv<T>(env: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const prev = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try { return await fn(); } finally {
    for (const k of KEYS) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }
  }
}
async function person(pg: PGlite, id: string) {
  await pg.query(`insert into "user" (id, name, email, "emailVerified") values ($1,$2,$3,true) on conflict do nothing`, [id, `ZZ TEST ${id}`, `${id}@example.com`]);
  await pg.query(`insert into profiles (user_id, full_name) values ($1,$2) on conflict do nothing`, [id, `ZZ TEST ${id}`]);
}
/** Owner + listing + an ACCEPTED request from `tenant`, made `daysAgo` days ago. Returns the application id. */
async function deal(pg: PGlite, owner: string, tenant: string, listing: string, daysAgo = 3) {
  await person(pg, owner); await person(pg, tenant);
  const city = (await pg.query<{ id: string }>(`select id from cities limit 1`)).rows[0]?.id;
  await pg.query(`insert into properties (id, owner_id, title, property_type, address, city_id, pincode, lat, lng) values ($1,$2,'ZZ TEST PG','PG','ZZ 1 Test Lane',$3,'575001',12.86,74.84) on conflict do nothing`, [`P-${listing}`, owner, city]);
  await pg.query(`insert into listings (id, property_id, owner_id, title, description, city_name, locality_name, monthly_rent, deposit, available_from, room_type, furnished)
    values ($1,$2,$3,'ZZ TEST bed','ZZ TEST','Mangaluru','Bunder',6999,6999,'2026-11-01','Shared room','Furnished') on conflict do nothing`, [listing, `P-${listing}`, owner]);
  const app = `A-${tenant}-${listing}`;
  await pg.query(`insert into applications (id, listing_id, seeker_id, host_id, status, created_at) values ($1,$2,$3,$4,'ACCEPTED', now() - ($5 || ' days')::interval)`, [app, listing, tenant, owner, String(daysAgo)]);
  return app;
}
const fee = async (sql: never, app: string) => (await allCommissions(sql)).find((c) => c.moveInId === `deposit:${app}`) ?? null;

describe("referral credits ledger", () => {
  test("kill switch off → nothing issued; on → one credit each, ₹499, notified, audited", async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-ref"); await person(pg, "zz-friend");
    await assert.rejects(issuePairCredits(sql, "zz-admin", { referrer: "zz-ref", friend: "zz-friend" }, feeCreditConfig({})), /switched off/);
    const rows = await issuePairCredits(sql, "zz-admin", { referrer: "zz-ref@example.com", friend: "zz-friend", note: "ZZ TEST moved in + paid month 1" }, ON);
    assert.equal(rows.length, 2);
    for (const r of rows) { assert.equal(r.amountInr, 499); assert.equal(r.status, "issued"); assert.equal(r.issuedBy, "zz-admin"); }
    assert.equal(await creditBalance(sql, "zz-ref"), 499);
    assert.equal(await creditBalance(sql, "zz-friend"), 499);
    assert.equal(await pairsUsed(sql), 1);
    assert.equal((await pg.query(`select 1 from notifications where user_id in ('zz-ref','zz-friend') and title like '%Roomeo credit%'`)).rows.length, 2);
    assert.ok((await recentCreditEvents(sql)).some((e) => e.action === "issued"));
    await assert.rejects(issuePairCredits(sql, "zz-admin", { referrer: "zz-ref", friend: "zz-friend" }, ON), /already has credits/);
    await assert.rejects(issuePairCredits(sql, "zz-admin", { referrer: "zz-friend", friend: "zz-ref" }, ON), /other way round|different referrer/);
    await assert.rejects(issuePairCredits(sql, "zz-admin", { referrer: "zz-ref", friend: "zz-ref" }, ON), /same account/);
    await person(pg, "zz-other");
    await assert.rejects(issuePairCredits(sql, "zz-admin", { referrer: "zz-other", friend: "zz-friend" }, ON), /different referrer/);
  });

  test("cap: 4 pairs (8 credits) by default; voided pairs free a slot; configurable", async () => {
    const { pg, sql } = await testDb();
    for (let i = 1; i <= 5; i++) { await person(pg, `zz-r${i}`); await person(pg, `zz-f${i}`); }
    for (let i = 1; i <= 4; i++) await issuePairCredits(sql, "zz-admin", { referrer: `zz-r${i}`, friend: `zz-f${i}` }, ON);
    assert.equal((await listCredits(sql)).length, 8);
    await assert.rejects(issuePairCredits(sql, "zz-admin", { referrer: "zz-r5", friend: "zz-f5" }, ON), /cap is reached \(4 of 4/);
    assert.equal((await issuePairCredits(sql, "zz-admin", { referrer: "zz-r5", friend: "zz-f5" }, { ...ON, pairsCap: 5 })).length, 2);
    for (const c of (await listCredits(sql)).filter((c) => c.userId === "zz-r1" || c.userId === "zz-f1")) await voidCredit(sql, "zz-admin", c.id, "ZZ TEST mistake");
    assert.equal(await pairsUsed(sql), 4);
  });

  test("void needs a reason, is audited, can't be repeated; balance drops", async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-ref"); await person(pg, "zz-friend");
    const [a] = await issuePairCredits(sql, "zz-admin", { referrer: "zz-ref", friend: "zz-friend" }, ON);
    await assert.rejects(voidCredit(sql, "zz-admin", a.id, " "), /reason|why/i);
    const v = await voidCredit(sql, "zz-admin", a.id, "ZZ TEST friend left");
    assert.equal(v.status, "void");
    assert.equal(v.voidedBy, "zz-admin");
    assert.equal(await creditBalance(sql, a.userId), 0);
    await assert.rejects(voidCredit(sql, "zz-admin", a.id, "again"), /already void/i);
    assert.ok((await recentCreditEvents(sql)).some((e) => e.action === "voided" && e.note.includes("friend left")));
  });

  test("tenant fee fully covered by credit: PAID by credit, ₹0, no invoice; payment reject restores the credit", async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-ref"); await person(pg, "zz-friend");
    await issuePairCredits(sql, "zz-admin", { referrer: "zz-ref", friend: "zz-friend" }, ON);
    await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind) values ('ZZP1','zz-friend','Success fee',499,'PENDING','UPI','ZZREF1','SUCCESS_FEE')`);
    assert.equal(await applyCreditsToPayment(sql, "ZZP1", feeCreditConfig({})), 0, "kill switch off → nothing applied");
    assert.equal(await applyCreditsToPayment(sql, "ZZP1", ON), 499);
    const p = (await pg.query<{ amount_inr: number; status: string; provider: string; credit_applied_inr: number }>(`select amount_inr, status, provider, credit_applied_inr from payments where id='ZZP1'`)).rows[0];
    assert.deepEqual(p, { amount_inr: 0, status: "PAID", provider: "CREDIT", credit_applied_inr: 499 });
    assert.equal(await createFeeInvoice(sql, "ZZP1", 499), null, "no invoice for ₹0 consideration");
    assert.equal(await creditBalance(sql, "zz-friend"), 0);
    assert.equal((await listCredits(sql, "zz-friend"))[0].status, "applied");
    assert.equal(await applyCreditsToPayment(sql, "ZZP1", ON), 0, "idempotent");
    assert.equal(await restoreCreditsForFee(sql, { feeKind: "tenant_fee", feeId: "ZZP1", actorId: "zz-admin", reason: "ZZ TEST payment rejected" }), 499);
    assert.equal(await creditBalance(sql, "zz-friend"), 499);
    assert.equal((await listCredits(sql, "zz-friend"))[0].status, "issued");
  });

  test("partial: a ₹200 credit on a ₹499 fee leaves ₹299 to pay (invoice on what's paid)", async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-ref"); await person(pg, "zz-friend");
    await issuePairCredits(sql, "zz-admin", { referrer: "zz-ref", friend: "zz-friend" }, { ...ON, amountInr: 200 });
    await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind) values ('ZZP2','zz-ref','Success fee',499,'PENDING','UPI','ZZREF2','SUCCESS_FEE')`);
    assert.equal(await applyCreditsToPayment(sql, "ZZP2", ON), 200);
    const p = (await pg.query<{ amount_inr: number; status: string; purpose: string }>(`select amount_inr, status, purpose from payments where id='ZZP2'`)).rows[0];
    assert.equal(p.amount_inr, 299);
    assert.equal(p.status, "PENDING");
    assert.match(p.purpose, /less ₹200 Roomeo credit/);
    // Smaller fee than credit: only the fee is used, the rest stays.
    await person(pg, "zz-r2"); await person(pg, "zz-f2");
    await issuePairCredits(sql, "zz-admin", { referrer: "zz-r2", friend: "zz-f2" }, ON);
    await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind) values ('ZZP3','zz-f2','Success fee',250,'PENDING','UPI','ZZREF3','SUCCESS_FEE')`);
    assert.equal(await applyCreditsToPayment(sql, "ZZP3", ON), 250);
    assert.equal(await creditBalance(sql, "zz-f2"), 249);
  });
});

describe("owner fee after the deposit + advance mark", () => {
  const OWNER = { OWNER_FEE_ENABLED: "true" };
  test("flag off → the mark is recorded but no fee; on → ₹499 due 7 days after the mark, never at accept", () => withEnv({}, async () => {
    const { pg, sql } = await testDb();
    const app = await deal(pg, "zz-own", "zz-ten", "ZZL1");
    const off = await markDepositReceived(sql, { applicationId: app, actorId: "zz-own", role: "owner" });
    assert.equal(off.commission, null);
    assert.equal(await fee(sql, app), null);
    await withEnv(OWNER, async () => {
      const app2 = await deal(pg, "zz-own", "zz-ten2", "ZZL2");
      assert.equal(await fee(sql, app2), null, "accepting a request charges nothing");
      await assert.rejects(markDepositReceived(sql, { applicationId: app2, actorId: "zz-ten2", role: "owner" }), /Only the owner/);
      await assert.rejects(markDepositReceived(sql, { applicationId: app2, actorId: "zz-own", role: "owner", receivedOn: addDays(istYmd(new Date()), 1) }), /future/);
      const r = await markDepositReceived(sql, { applicationId: app2, actorId: "zz-own", role: "owner" });
      assert.equal(r.commission?.created, true);
      const c = (await fee(sql, app2))!;
      assert.equal(c.totalInr, 499);
      assert.equal(c.status, "due");
      assert.equal(c.trigger, "deposit");
      assert.equal(c.dueOn, addDays(istYmd(new Date()), 7));
      // Duplicate marks: no second fee.
      const again = await markDepositReceived(sql, { applicationId: app2, actorId: "zz-admin", role: "admin" });
      assert.equal(again.already, true);
      assert.equal((await allCommissions(sql)).length, 1);
      // Admin can mark too (no ownership check), e.g. the earlier request once the flag is on.
      const adm = await markDepositReceived(sql, { applicationId: app, actorId: "zz-admin", role: "admin" });
      assert.equal(adm.already, true, "already marked while off: re-marking doesn't create a fee by itself");
    });
  }));

  test("undo voids an unpaid fee; re-mark reinstates the same row (no double charge); undo refused after a cash payment", () => withEnv(OWNER, async () => {
    const { pg, sql } = await testDb();
    const app = await deal(pg, "zz-own", "zz-ten", "ZZL1");
    await markDepositReceived(sql, { applicationId: app, actorId: "zz-own", role: "owner" });
    const first = (await fee(sql, app))!;
    await assert.rejects(undoDepositMark(sql, { applicationId: app, actorId: "zz-own", role: "owner", reason: "" }), /Say why/);
    const u = await undoDepositMark(sql, { applicationId: app, actorId: "zz-own", role: "owner", reason: "ZZ TEST deposit returned" });
    assert.equal(u.voided, first.id);
    assert.equal((await fee(sql, app))!.status, "void");
    await markDepositReceived(sql, { applicationId: app, actorId: "zz-own", role: "owner" });
    const back = (await allCommissions(sql));
    assert.equal(back.length, 1, "same row reinstated");
    assert.equal(back[0].id, first.id);
    assert.equal(back[0].status, "due");
    assert.equal((await pg.query<{ mark_count: number }>(`select mark_count from deposit_marks where application_id = $1`, [app])).rows[0].mark_count, 2);
    await markCommissionPaid(sql, first.id, "zz-admin", istYmd(new Date()), "ZZTEST-PAY");
    await assert.rejects(undoDepositMark(sql, { applicationId: app, actorId: "zz-admin", role: "admin", reason: "ZZ" }), /paid|refund/i);
    assert.equal((await createCommissionForMoveIn(sql, "nope", { force: true })).created, false);
  }));

  test("founding partner → ₹0 'waived', no link", () => withEnv(OWNER, async () => {
    const { pg, sql } = await testDb();
    const app = await deal(pg, "zz-own", "zz-ten", "ZZL1");
    await setFoundingPartner(sql, "zz-own", "zz-admin", { on: true, note: "ZZ TEST" });
    await markDepositReceived(sql, { applicationId: app, actorId: "zz-own", role: "owner" });
    const c = (await fee(sql, app))!;
    assert.equal(c.status, "waived");
    assert.equal(c.totalInr, 0);
    assert.equal(c.amountDueInr, 0);
    assert.equal(c.paymentLinkMode, "none");
  }));

  test("owner's credit covers the fee → paid by credit (₹0 cash); undo restores the credit", () => withEnv({ ...OWNER, ROOMEO_REFERRAL_CREDITS_ENABLED: "true" }, async () => {
    const { pg, sql } = await testDb();
    const app = await deal(pg, "zz-own", "zz-ten", "ZZL1");
    await person(pg, "zz-friend");
    await issuePairCredits(sql, "zz-admin", { referrer: "zz-own", friend: "zz-friend" }, ON);
    await markDepositReceived(sql, { applicationId: app, actorId: "zz-own", role: "owner" });
    const c = (await fee(sql, app))!;
    assert.equal(c.status, "paid");
    assert.equal(c.creditInr, 499);
    assert.equal(c.paidInr, 0);
    assert.equal(c.amountDueInr, 0);
    assert.equal(await creditBalance(sql, "zz-own"), 0);
    await undoDepositMark(sql, { applicationId: app, actorId: "zz-own", role: "owner", reason: "ZZ TEST tenant didn't come" });
    assert.equal((await fee(sql, app))!.status, "void");
    assert.equal(await creditBalance(sql, "zz-own"), 499);
  }));

  test("early exit: ₹250 (50%); credit counts first, excess credit goes back as credit", () => withEnv({ ...OWNER, ROOMEO_REFERRAL_CREDITS_ENABLED: "true", ROOMEO_REFERRAL_CREDIT_INR: "200" }, async () => {
    const { pg, sql } = await testDb();
    const today = istYmd(new Date());
    // No credit: plain ₹250.
    const a0 = await deal(pg, "zz-own0", "zz-ten0", "ZZL0");
    await markDepositReceived(sql, { applicationId: a0, actorId: "zz-own0", role: "owner" });
    assert.equal((await recordEarlyExit(sql, (await fee(sql, a0))!.id, "zz-admin", today)).amountDueInr, 250);
    // ₹200 credit used → ₹299 due; early exit → ₹250 owed, ₹200 of it credit, ₹50 cash due.
    const app = await deal(pg, "zz-own", "zz-ten", "ZZL1");
    await person(pg, "zz-friend");
    await issuePairCredits(sql, "zz-admin", { referrer: "zz-own", friend: "zz-friend" }, { ...ON, amountInr: 200 });
    await markDepositReceived(sql, { applicationId: app, actorId: "zz-own", role: "owner" });
    const c = (await fee(sql, app))!;
    assert.equal(c.creditInr, 200);
    assert.equal(c.amountDueInr, 299);
    const e = await recordEarlyExit(sql, c.id, "zz-admin", today);
    assert.equal(e.status, "due_50");
    assert.equal(e.amountDueInr, 50);
    assert.equal(await creditBalance(sql, "zz-own"), 0, "the ₹200 credit stays used (it's within the ₹250)");
  }));

  test("50% refund on a credit-paid fee goes back as credit, not cash", () => withEnv({ ...OWNER, ROOMEO_REFERRAL_CREDITS_ENABLED: "true" }, async () => {
    const { pg, sql } = await testDb();
    const today = istYmd(new Date());
    const app = await deal(pg, "zz-own", "zz-ten", "ZZL1");
    await person(pg, "zz-friend");
    await issuePairCredits(sql, "zz-admin", { referrer: "zz-own", friend: "zz-friend" }, ON);
    await markDepositReceived(sql, { applicationId: app, actorId: "zz-own", role: "owner" });
    const c = (await fee(sql, app))!;
    const r = await recordCommissionRefund(sql, c.id, "zz-admin", { vacatedOn: today, refundedOn: today, ref: "ZZ TEST" });
    assert.equal(r.status, "refunded_50");
    assert.equal(r.refundInr, 0, "no cash refund: nothing was paid in cash");
    assert.equal(await creditBalance(sql, "zz-own"), 250);
  }));

  test("0032 is safe to re-run and leaves existing rows unchanged", () => withEnv(OWNER, async () => {
    const { pg, sql } = await testDb();
    const app = await deal(pg, "zz-own", "zz-ten", "ZZL1");
    await markDepositReceived(sql, { applicationId: app, actorId: "zz-own", role: "owner" });
    const tables = ["owner_commissions", "deposit_marks", "referral_credits", "payments"];
    const before = await Promise.all(tables.map(async (t) => (await pg.query(`select * from ${t} order by 1`)).rows));
    await pg.exec(readFileSync(new URL("0032_owner_fee_deposit_credits.sql", migrationsDir), "utf8"));
    const after = await Promise.all(tables.map(async (t) => (await pg.query(`select * from ${t} order by 1`)).rows));
    assert.deepEqual(after, before);
    await assert.rejects(pg.query(`update owner_commissions set status = 'bogus'`), /check/i);
    await assert.rejects(pg.query(`update owner_commissions set fee_inr = 0, total_inr = 0 where status = 'due'`), /check/i);
  }));
});
