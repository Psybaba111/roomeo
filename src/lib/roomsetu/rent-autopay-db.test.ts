// Migration 0018 + webhook/cron SQL against in-memory PGlite, Cashfree mocked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { applyCashfreeEvent, listingRentBadge, runRentSweep } from "./rent-autopay-db.ts";
import { eventKey, parseCashfreeEvent } from "./rent-autopay.ts";

const dir = new URL("../../../migrations/", import.meta.url);

async function db() {
  const pg = new PGlite();
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) await pg.exec(readFileSync(new URL(f, dir), "utf8"));
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
      return (await pg.query(text, values)).rows;
    },
    { query: async (text: string, params?: unknown[]) => (await pg.query(text, params)).rows },
  );
  return { pg, sql: sql as never };
}

const ist = (s: string) => new Date(`${s}+05:30`);

test("migration 0018 re-runs cleanly", async () => {
  const { pg } = await db();
  await pg.exec(readFileSync(new URL("0018_rent_autopay.sql", dir), "utf8"));
});

test("sweep: notify → charge → webhook PAID (idempotent) → badge", async () => {
  const { pg, sql } = await db();
  await pg.query(`insert into rent_plans (id, listing_id, renter_id, owner_id, amount_inr, due_day) values ('plan1','L1','renter','owner',8999,5)`);
  await pg.query(`insert into rent_mandates (id, plan_id, subscription_id, status, max_amount_inr) values ('m1','plan1','rm_rent_plan1_1','ACTIVE',8999)`);
  const charges: unknown[] = [];
  const charger = { raiseCharge: async (p: unknown) => (charges.push(p), { cfPaymentId: "9", status: "INITIALIZED" }) };
  const link = () => "https://roomeo/dashboard#rent";

  assert.equal((await runRentSweep(sql, charger, ist("2026-11-03T08:30:00"), link)).notified, 1);
  assert.equal((await runRentSweep(sql, charger, ist("2026-11-03T08:30:00"), link)).notified, 0, "no double notice");
  const outbox = (await pg.query<{ template: string }>(`select template from rent_outbox`)).rows;
  assert.deepEqual(outbox.map((r) => r.template), ["roomeo_rent_predebit"]);

  assert.equal((await runRentSweep(sql, charger, ist("2026-11-04T11:00:00"), link)).charged, 0, "outside NPCI window");
  const r1 = await runRentSweep(sql, charger, ist("2026-11-04T08:30:00"), link);
  assert.deepEqual(r1, { notified: 0, charged: 1, fallbacks: 0, errors: 0 });
  assert.equal((charges[0] as { scheduleDate: string }).scheduleDate, "2026-11-05");
  assert.equal((await runRentSweep(sql, charger, ist("2026-11-04T13:30:00"), link)).charged, 0, "no double charge");

  const body = { type: "SUBSCRIPTION_PAYMENT_SUCCESS", event_time: "2026-11-05T09:00:00+05:30", data: { subscription_id: "rm_rent_plan1_1", payment_id: "rm_rp_plan1_202611_1", cf_payment_id: "9", payment_amount: 8999, payment_type: "CHARGE" } };
  const ev = parseCashfreeEvent(body);
  const key = eventKey(body.type, "1", "s", ev);
  assert.equal(await applyCashfreeEvent(sql, key, body.type, body, ev), "applied");
  assert.equal(await applyCashfreeEvent(sql, key, body.type, body, ev), "duplicate");
  const e = (await pg.query<{ status: string; provider_confirmed: boolean }>(`select status, provider_confirmed from rent_entries`)).rows[0];
  assert.deepEqual(e, { status: "PAID", provider_confirmed: true });

  // A late FAILED for the same payment never downgrades PAID.
  const failBody = { ...body, type: "SUBSCRIPTION_PAYMENT_FAILED" };
  const fev = parseCashfreeEvent(failBody);
  await applyCashfreeEvent(sql, eventKey(failBody.type, "2", "t", fev), failBody.type, failBody, fev);
  assert.equal((await pg.query<{ status: string }>(`select status from rent_entries`)).rows[0].status, "PAID");

  assert.deepEqual(await listingRentBadge(sql, "L1", ist("2026-11-20T09:00:00")), { percent: 100, months: 1 });
  assert.equal(await listingRentBadge(sql, "L2", ist("2026-11-20T09:00:00")), null);
});

test("failed debit: one retry, then UPI link fallback queued once", async () => {
  const { pg, sql } = await db();
  await pg.query(`insert into rent_plans (id, listing_id, renter_id, owner_id, amount_inr, due_day) values ('p2','L1','r','o',5000,5)`);
  await pg.query(`insert into rent_mandates (id, plan_id, subscription_id, status, max_amount_inr) values ('m2','p2','sub2','ACTIVE',5000)`);
  const charger = { raiseCharge: async () => ({ cfPaymentId: null, status: "INITIALIZED" }) };
  await runRentSweep(sql, charger, ist("2026-11-03T08:30:00"), () => "L");
  await runRentSweep(sql, charger, ist("2026-11-04T08:30:00"), () => "L");
  await pg.query(`update rent_entries set status = 'FAILED'`);
  assert.equal((await runRentSweep(sql, charger, ist("2026-11-05T21:45:00"), () => "L")).charged, 1, "retry");
  assert.equal((await pg.query<{ attempts: number }>(`select attempts from rent_entries`)).rows[0].attempts, 2);
  await pg.query(`update rent_entries set status = 'FAILED'`);
  assert.equal((await runRentSweep(sql, charger, ist("2026-11-06T08:30:00"), () => "L")).fallbacks, 1);
  assert.equal((await runRentSweep(sql, charger, ist("2026-11-07T08:30:00"), () => "L")).fallbacks, 0);
  const t = (await pg.query<{ template: string }>(`select template from rent_outbox order by created_at`)).rows.map((r) => r.template);
  assert.deepEqual(t, ["roomeo_rent_predebit", "roomeo_rent_pay_link"]);
});

test("mandate status webhook updates the mandate; unknown subscription is reported", async () => {
  const { pg, sql } = await db();
  await pg.query(`insert into rent_mandates (id, plan_id, subscription_id, status, max_amount_inr) values ('m3','p3','sub3','INITIALIZED',1)`);
  const body = { type: "SUBSCRIPTION_STATUS_CHANGED", data: { subscription_details: { subscription_id: "sub3", cf_subscription_id: "77", subscription_status: "ACTIVE" } } };
  const ev = parseCashfreeEvent(body);
  assert.equal(await applyCashfreeEvent(sql, eventKey(body.type, "1", "s", ev), body.type, body, ev), "applied");
  assert.deepEqual((await pg.query(`select status, cf_subscription_id from rent_mandates`)).rows[0], { status: "ACTIVE", cf_subscription_id: "77" });
  const other = { ...body, data: { subscription_details: { subscription_id: "nope", subscription_status: "ACTIVE" } } };
  const oev = parseCashfreeEvent(other);
  assert.equal(await applyCashfreeEvent(sql, eventKey(other.type, "1", "s", oev), other.type, other, oev), "unknown");
});
