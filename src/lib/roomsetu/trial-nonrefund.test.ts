import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb, seedListing } from "./pgtest.ts";
import { bookTrial, confirmTrialFromPayment, findTrialCredit, setListingTrial } from "./trial-db.ts";
import { refundFeesForStayEnd } from "./agreement-db.ts";
import { TRIAL_ARRIVAL_CHECKLIST } from "./trial-nights.ts";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("₹99 never refunded; credit single-use even after the fee is refunded; cancelled checkout frees it", async () => {
  const { pg, sql } = await testDb();
  await seedListing(pg);
  await setListingTrial(sql, { listingId: "L1", ownerId: "owner", enabled: true, nightlyInr: "400" });
  const now = new Date("2026-11-01T06:00:00Z");
  const b = await bookTrial(sql, { listingId: "L1", seekerId: "tenant", checkIn: "2026-11-05", nights: 1, ref: "RMT1", now });
  // created_at defaults to the DB clock (real time). Pin it to the simulated booking time, otherwise the
  // test time-bombs once the real date passes `issued` below (a deal issued before the booking earns no
  // credit, which is correct and covered in trial-nights.test.ts).
  await pg.query(`update trial_bookings set created_at = $2 where id = $1`, [b.bookingId, now.toISOString()]);
  await pg.query(`update payments set status = 'PAID', reviewed_at = now() where ref = 'RMT1'`);
  const tp = (await pg.query<{ id: string }>(`select id from payments where ref = 'RMT1'`)).rows[0].id;
  await confirmTrialFromPayment(sql, tp);
  const issued = "2026-11-08T06:00:00Z";
  assert.equal((await findTrialCredit(sql, "tenant", issued))?.bookingId, b.bookingId);
  // fee checkout opened then closed unpaid -> credit still available
  await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, agreement_id, trial_credit_inr, trial_credit_booking_id) values ('f0','tenant','fee',490,'CANCELLED','UPI','RF0','SUCCESS_FEE','ag',99,$1)`, [b.bookingId]);
  assert.equal((await findTrialCredit(sql, "tenant", issued))?.bookingId, b.bookingId);
  // paid ₹490 with the credit, then a 7-day move-out refund
  await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, agreement_id, trial_credit_inr, trial_credit_booking_id, reviewed_at) values ('f1','tenant','fee',490,'PAID','UPI','RF1','SUCCESS_FEE','ag',99,$1, now())`, [b.bookingId]);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  assert.deepEqual(await refundFeesForStayEnd(sql, "ag", today, "moved out"), { refunds: 1, kept: 0 });
  const rows = (await pg.query<{ id: string; status: string; amount_inr: number }>(`select id, status, amount_inr from payments order by id`)).rows;
  assert.equal(rows.find((r) => r.id === "f1")?.status, "REFUND_DUE");
  assert.equal(rows.find((r) => r.id === "f1")?.amount_inr, 490, "refund is the ₹490 actually paid");
  assert.equal(rows.find((r) => r.id === tp)?.status, "PAID", "₹99 trial fee stays paid, never refunded");
  assert.equal(await findTrialCredit(sql, "tenant", issued), null, "credit not reusable after refund");
  await pg.query(`update payments set status = 'REFUNDED' where id = 'f1'`);
  assert.equal(await findTrialCredit(sql, "tenant", issued), null);
  await pg.close();
});

test("copy says the ₹99 is non-refundable", () => {
  assert.ok(TRIAL_ARRIVAL_CHECKLIST.some((c) => /non-refundable/.test(c)));
  assert.match(src("routes/pricing.tsx"), /Is the ₹99 trial night fee refundable\?", "No\./);
  assert.match(src("routes/pricing.tsx"), /The ₹\{TRIAL_FEE_INR\} is non-refundable/);
  assert.match(src("components/trial-nights.tsx"), /Non-refundable/);
  assert.match(src("components/trial-nights.tsx"), /\(non-refundable\)/);
});
