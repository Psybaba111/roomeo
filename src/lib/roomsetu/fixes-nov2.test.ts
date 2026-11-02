import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb, seedListing } from "./pgtest.ts";
import { bookTrial, confirmTrialFromPayment, myOpenTrial, ownerTrialBookings, setListingTrial } from "./trial-db.ts";
import { dealSteps } from "./deal-steps.ts";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("#1/#2 open trial is restored after reload; owner sees confirmed guests for ID check", async () => {
  const { pg, sql } = await testDb();
  await seedListing(pg);
  const now = new Date("2026-11-01T06:00:00Z");
  await setListingTrial(sql, { listingId: "L1", ownerId: "owner", enabled: true, nightlyInr: "400" });
  assert.equal(await myOpenTrial(sql, { listingId: "L1", seekerId: "tenant" }), null);
  const b = await bookTrial(sql, { listingId: "L1", seekerId: "tenant", checkIn: "2026-11-05", nights: 2, ref: "RMTRIAL001", now });
  const mine = await myOpenTrial(sql, { listingId: "L1", seekerId: "tenant" });
  assert.deepEqual([mine?.bookingId, mine?.status, mine?.paymentRef, mine?.paymentStatus, mine?.feeInr, mine?.nights], [b.bookingId, "FEE_PENDING", "RMTRIAL001", "PENDING", 99, 2]);
  assert.deepEqual(await ownerTrialBookings(sql, { listingId: "L1", ownerId: "owner" }), [], "not shown before admin approval");
  await pg.query(`update payments set status = 'PAID' where ref = 'RMTRIAL001'`);
  const pid = (await pg.query<{ id: string }>(`select id from payments where ref = 'RMTRIAL001'`)).rows[0].id;
  await confirmTrialFromPayment(sql, pid);
  const g = await ownerTrialBookings(sql, { listingId: "L1", ownerId: "owner" });
  assert.deepEqual([g.length, g[0].id, g[0].idCheckedAt], [1, b.bookingId, ""]);
  assert.deepEqual(await ownerTrialBookings(sql, { listingId: "L1", ownerId: "tenant" }), [], "only the owner");
  assert.equal((await myOpenTrial(sql, { listingId: "L1", seekerId: "tenant" }))?.status, "CONFIRMED");
  await pg.close();
});

test("#1/#2 UI wiring: UTR entry via UpiCheckout, owner ID check rendered", () => {
  const t = src("components/trial-nights.tsx");
  assert.match(t, /<UpiCheckout/);
  assert.match(t, /getMyTrialBooking/);
  assert.match(t, /<TrialIdCheckButton bookingId=\{g\.id\}/);
});

test("#3/#4 fee box uses payable (₹490 with credit) and shows refund state instead of re-asking", () => {
  const a = src("lib/roomsetu/agreement-api.ts");
  assert.match(a, /payable/);
  assert.match(a, /Your fee refund is pending admin approval/);
  const d = src("components/deal-agreement.tsx");
  assert.match(d, /trial-credit-line/);
  assert.match(d, /Refund pending admin approval/);
  assert.match(d, /Pay ₹\{a\.payable\}/);
});

test("#5 deal steps copy: ₹499 + GST = ₹589, 7 days of paying, no ₹999", () => {
  const s = dealSteps({ role: "tenant", iSigned: true, issued: true, cancelled: false, feeOn: true, feePaid: false, feeTotal: 589, movedIn: false });
  const pay = s.find((x) => x.key === "pay")!;
  assert.match(pay.hint, /₹589 once \(₹499 \+ 18% GST = ₹589\)/);
  assert.match(pay.hint, /within 7 days of paying, both sides get their fee back/);
  assert.doesNotMatch(pay.hint, /999/);
  assert.match(dealSteps({ role: "tenant", iSigned: true, issued: true, cancelled: false, feeOn: true, feePaid: false, feeTotal: 490, movedIn: false })[2].hint, /₹490 once.*less your trial credit/);
});

test("#6 admin payments list shows the agreement ID used by the move-out form", () => {
  assert.match(src("lib/roomsetu/admin-api.ts"), /da\.application_id as agreement_key/);
  assert.match(src("routes/admin.payments.tsx"), /Use for move-out/);
});

test("#8 dashboard recommendations filter city/budget in SQL before the limit", () => {
  const a = src("lib/roomsetu/account-api.ts");
  assert.match(a, /lower\(trim\(l\.city_name\)\) = lower\(trim\(\$2\)\)/);
  assert.match(a, /l\.monthly_rent <= \$3::int/);
});

test("#9 pricing page explains trial nights and the ₹99 credit", () => {
  const p = src("routes/pricing.tsx");
  assert.match(p, /data-testid="pricing-trial"/);
  assert.match(p, /paid directly to the owner/);
  assert.match(p, /comes off your ₹589 fee/);
});

test("#10 heading, revenue group, referral page, accept/decline errors", () => {
  assert.match(src("routes/search.tsx"), /"Beds near you"/);
  assert.doesNotMatch(src("routes/search.tsx"), /Beds in Mangaluru/);
  assert.match(src("lib/roomsetu/pricing-api.ts"), /k === "TRIAL_FEE" \? "Trial fees"/);
  const r = src("routes/r.$code.tsx");
  assert.doesNotMatch(r, /REFERRAL_CREDIT_INR/);
  assert.match(r, /getInviteStatus/);
  assert.match(src("routes/applications.tsx"), /application-action-error/);
});
