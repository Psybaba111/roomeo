import test from "node:test";
import assert from "node:assert/strict";
import {
  TRIAL_FEE_INR, feeAfterTrialCredit, inclusiveGstSplit, trialCheckOut, trialCreditEligible, trialFeeBreakdown, trialFeeText,
  showTrialPrompt, trialNightsEnabled, trialStayTotal, validCheckIn, validNightlyPrice, validNights,
} from "./trial-nights.ts";
import { testDb, seedListing } from "./pgtest.ts";
import { readFileSync } from "node:fs";
import { bookTrial, confirmTrialFromPayment, findTrialCredit, listingTrial, markTrialIdChecked, setListingTrial, tenantFeeWithTrialCredit, adminTrialBookings } from "./trial-db.ts";

test("₹99 incl. GST splits exactly into ₹83.90 + ₹15.10", () => {
  const f = trialFeeBreakdown();
  assert.equal(TRIAL_FEE_INR, 99);
  assert.deepEqual([f.total, f.base, f.gst, f.basePaise + f.gstPaise], [99, 83.9, 15.1, 9900]);
  assert.match(trialFeeText(), /₹99 incl\. GST \(₹83\.90 \+ ₹15\.10 GST at 18%\), once per trial booking/);
  assert.equal(inclusiveGstSplit(589).basePaise + inclusiveGstSplit(589).gstPaise, 58900);
});

test("flag is off by default", () => {
  assert.equal(trialNightsEnabled({}), false);
  assert.equal(trialNightsEnabled({ ROOMEO_TRIAL_NIGHTS_ENABLED: "false" }), false);
  assert.equal(trialNightsEnabled({ ROOMEO_TRIAL_NIGHTS_ENABLED: "true" }), true);
});

test("1 to 3 nights, whole-rupee price, sane check-in", () => {
  assert.equal(validNights(1), 1);
  assert.equal(validNights("3"), 3);
  for (const bad of [0, 4, 1.5, "x", null]) assert.throws(() => validNights(bad));
  assert.equal(validNightlyPrice("450"), 450);
  assert.throws(() => validNightlyPrice(0));
  assert.equal(trialStayTotal(450, 3), 1350);
  assert.equal(validCheckIn("2026-11-02", "2026-11-01"), "2026-11-02");
  assert.throws(() => validCheckIn("2026-10-31", "2026-11-01"), /past/);
  assert.throws(() => validCheckIn("2027-03-01", "2026-11-01"), /60 days/);
});

test("credit only if the deal is issued within 14 days of check-out", () => {
  assert.equal(trialCheckOut("2026-11-05", 3), "2026-11-08");
  const base = { checkIn: "2026-11-05", nights: 3, bookedOn: "2026-11-01" };
  assert.equal(trialCreditEligible({ ...base, dealIssuedOn: "2026-11-22" }), true);
  assert.equal(trialCreditEligible({ ...base, dealIssuedOn: "2026-11-23" }), false);
  assert.equal(trialCreditEligible({ ...base, dealIssuedOn: "2026-10-30" }), false);
  assert.deepEqual(feeAfterTrialCredit(589, true), { amount: 490, credit: 99 });
  assert.deepEqual(feeAfterTrialCredit(589, false), { amount: 589, credit: 0 });
});

test("book → admin approves ₹99 → confirmed → ID check → one-time credit", async () => {
  const { pg, sql } = await testDb();
  await seedListing(pg);
  const now = new Date("2026-11-01T06:00:00Z");
  await assert.rejects(bookTrial(sql, { listingId: "L1", seekerId: "tenant", checkIn: "2026-11-05", nights: 2, ref: "RMTRIAL001", now }), /doesn't offer/);
  await assert.rejects(setListingTrial(sql, { listingId: "L1", ownerId: "tenant", enabled: true, nightlyInr: 400 }), /Only the owner/);
  await setListingTrial(sql, { listingId: "L1", ownerId: "owner", enabled: true, nightlyInr: "400" });
  await assert.rejects(bookTrial(sql, { listingId: "L1", seekerId: "tenant", checkIn: "2026-11-05", nights: 4, ref: "RMTRIAL001", now }), /1 to 3/);
  await assert.rejects(bookTrial(sql, { listingId: "L1", seekerId: "owner", checkIn: "2026-11-05", nights: 1, ref: "RMTRIAL001", now }), /own room/);

  const b = await bookTrial(sql, { listingId: "L1", seekerId: "tenant", checkIn: "2026-11-05", nights: 2, ref: "RMTRIAL001", now });
  assert.deepEqual([b.nights, b.stayTotalInr, b.feeInr, b.paymentStatus], [2, 800, 99, "PENDING"]);
  const again = await bookTrial(sql, { listingId: "L1", seekerId: "tenant", checkIn: "2026-11-06", nights: 3, ref: "RMTRIAL002", now });
  assert.equal(again.bookingId, b.bookingId, "reuses the open booking");
  assert.equal(again.paymentRef, "RMTRIAL001", "one fee per booking, not per night");
  assert.equal(again.feeInr, 99);
  assert.equal(again.stayTotalInr, 1200);

  assert.equal(await confirmTrialFromPayment(sql, "nope"), null);
  await pg.query(`update payments set status = 'PAID' where ref = 'RMTRIAL001'`);
  const pid = (await pg.query<{ id: string }>(`select id from payments where ref = 'RMTRIAL001'`)).rows[0].id;
  const c = await confirmTrialFromPayment(sql, pid);
  assert.equal(c?.seekerId, "tenant");
  assert.equal(await confirmTrialFromPayment(sql, pid), null, "idempotent");

  await assert.rejects(markTrialIdChecked(sql, { bookingId: b.bookingId, ownerId: "tenant" }));
  await markTrialIdChecked(sql, { bookingId: b.bookingId, ownerId: "owner" });

  // Check-out 2026-11-09; deal issued 2026-11-20 is within 14 days.
  const fee = await tenantFeeWithTrialCredit(sql, "tenant", 589, "2026-11-20T10:00:00Z");
  assert.deepEqual([fee.amount, fee.credit, fee.bookingId], [490, 99, b.bookingId]);
  assert.equal(await findTrialCredit(sql, "tenant", "2026-11-24T10:00:00Z"), null, "too late");

  // Once a fee payment carries the credit, it can't be used again.
  await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, trial_credit_inr, trial_credit_booking_id)
    values ('f1','tenant','Success fee',490,'PENDING','UPI','RMFEE00001','SUCCESS_FEE',99,$1)`, [b.bookingId]);
  assert.equal(await findTrialCredit(sql, "tenant", "2026-11-20T10:00:00Z"), null);

  const list = await adminTrialBookings(sql);
  assert.equal(list[0].status, "CONFIRMED");
  assert.ok(list[0].idCheckedAt);
  assert.equal(list[0].creditedOn, "RMFEE00001");
  await pg.close();
});

test("trial prompt is per listing: switching one listing off hides only that one", async () => {
  const { pg, sql } = await testDb();
  await seedListing(pg, "MUD1");
  await seedListing(pg, "OTHER1");
  // New listings start with trials off (owner opts in), so no prompt by default.
  assert.equal((await listingTrial(sql, "MUD1"))?.enabled, false);
  await setListingTrial(sql, { listingId: "MUD1", ownerId: "owner", enabled: true, nightlyInr: 500 });
  await setListingTrial(sql, { listingId: "OTHER1", ownerId: "owner", enabled: true, nightlyInr: 500 });
  await setListingTrial(sql, { listingId: "MUD1", ownerId: "owner", enabled: false });
  assert.equal((await listingTrial(sql, "MUD1"))?.enabled, false);
  assert.equal((await listingTrial(sql, "OTHER1"))?.enabled, true);
  await pg.close();
});

test("showTrialPrompt: only a bookable trial shows the prompt", () => {
  assert.equal(showTrialPrompt({ available: true }), true);
  assert.equal(showTrialPrompt({ available: false }), false);
  assert.equal(showTrialPrompt(null), false);
  assert.equal(showTrialPrompt(undefined), false);
});

test("listing page has no unconditional trial-night link", () => {
  const page = readFileSync(new URL("../../routes/listing.$id.tsx", import.meta.url), "utf8");
  assert.ok(!page.includes("Book a trial night"), "trial link text must live in TrialNightsLink, gated per listing");
  assert.ok(page.includes("<TrialNightsLink listingId={room.id} />"));
  const comp = readFileSync(new URL("../../components/trial-nights.tsx", import.meta.url), "utf8");
  assert.match(comp, /setShow\(showTrialPrompt\(t\)\)/);
  assert.ok(comp.includes("Not sure yet? Book a trial night · ₹99"), "wording unchanged");
});
