// Migration 0020 + complaints/receipts SQL against in-memory PGlite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb, seedListing, migrationsDir } from "./pgtest.ts";
import { complaintPhoto, confirmComplaint, listComplaints, listReceipts, markRentPaid, moveComplaint, raiseComplaint, receiptFor, saveReceiptProfile } from "./complaints-db.ts";

async function withMoveIn() {
  const t = await testDb();
  await seedListing(t.pg);
  await t.pg.query(`insert into move_ins (id, listing_id, seeker_id, owner_id, confirmed_at) values ('mi1','L1','tenant','owner', now())`);
  return t;
}

test("migration 0020 re-runs cleanly", async () => {
  const { pg } = await testDb();
  await pg.exec(readFileSync(new URL("0020_complaints_receipts.sql", migrationsDir), "utf8"));
});

test("complaint: raise → in progress → fixed → reopen → fixed → confirm + rate; stats", async () => {
  const { pg, sql } = await withMoveIn();
  await assert.rejects(raiseComplaint(sql, "stranger", { listingId: "L1", category: "AC", description: "AC dead", photo: null }));
  const id = await raiseComplaint(sql, "tenant", { listingId: "L1", category: "AC", description: "AC not cooling", photo: "QUJD" });
  assert.equal(await complaintPhoto(sql, id, "owner"), "data:image/jpeg;base64,QUJD");
  await assert.rejects(complaintPhoto(sql, id, "stranger"));
  await assert.rejects(moveComplaint(sql, id, "tenant", "FIXED", ""), /allowed/);
  await moveComplaint(sql, id, "owner", "IN_PROGRESS", "Technician at 5");
  await assert.rejects(confirmComplaint(sql, id, "tenant", 5, ""));
  await moveComplaint(sql, id, "owner", "FIXED", "");
  await moveComplaint(sql, id, "tenant", "OPEN", "still warm");
  await moveComplaint(sql, id, "owner", "FIXED", "Gas refilled");
  await pg.query(`update complaints set created_at = fixed_at - interval '5 hours' where id = $1`, [id]);
  await confirmComplaint(sql, id, "tenant", 4, "thanks");
  const l = await listComplaints(sql, "owner");
  assert.equal(l.owned[0].status, "CLOSED");
  assert.equal(l.owned[0].ownerNote, "Gas refilled");
  assert.match(l.owned[0].createdAt, /^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} [AP]M IST$/);
  assert.match(l.owned[0].fixedAt ?? "", / IST$/);
  assert.deepEqual(l.ownerStats, { open: 0, avgFixHours: 5, avgRating: 4 });
  assert.equal((await listComplaints(sql, "tenant")).mine.length, 1);
  assert.equal((await listComplaints(sql, "stranger")).owned.length, 0);
  const notes = (await pg.query(`select user_id from notifications where kind = 'complaint'`)).rows.length;
  assert.equal(notes, 3);
});

test("receipts: manual owner mark → tenant downloads; AutoPay rent_entries win when present", async () => {
  const { pg, sql } = await withMoveIn();
  await assert.rejects(markRentPaid(sql, "tenant", { moveInId: "mi1", month: "2026-11", amountInr: 8999, paidOn: "2026-11-03", method: "UPI", ref: "" }));
  await markRentPaid(sql, "owner", { moveInId: "mi1", month: "2026-11", amountInr: 8999, paidOn: "2026-11-03", method: "UPI", ref: "123456789012" });
  await markRentPaid(sql, "owner", { moveInId: "mi1", month: "2026-12", amountInr: 8999, paidOn: "2026-12-04", method: "CASH", ref: "" });
  await assert.rejects(saveReceiptProfile(sql, "owner", { landlordName: "Athiti", pan: "bad", address: "" }));
  await saveReceiptProfile(sql, "owner", { landlordName: "Athiti Hospitality", pan: "abcde1234f", address: "Kadri, Mangaluru" });
  let list = await listReceipts(sql, "tenant");
  assert.deepEqual(list.receipts.map((r) => r.month), ["2026-12", "2026-11"]);
  const rc = await receiptFor(sql, list.receipts[1].key, "tenant");
  assert.equal(rc.tenantName, "Asha Tenant");
  assert.equal(rc.landlordPan, "ABCDE1234F");
  assert.equal(rc.propertyAddress, "Mud Home 2-sharing, Kadri, Mangaluru");
  await assert.rejects(receiptFor(sql, list.receipts[1].key, "stranger"));

  // Simulate PR #36's tables: a PAID AutoPay entry for Nov replaces the manual one.
  await pg.exec(`create table rent_plans (id text primary key, listing_id text, renter_id text, owner_id text);
    create table rent_entries (id text primary key, plan_id text, month text, amount_inr integer, status text, paid_at timestamptz, cf_payment_id text, provider_ref text);
    insert into rent_plans values ('p1','L1','tenant','owner');
    insert into rent_entries values ('e1','p1','2026-11',8999,'PAID','2026-11-05T04:00:00Z','cf9',null);`);
  list = await listReceipts(sql, "tenant");
  assert.deepEqual(list.receipts.map((r) => `${r.month}:${r.source}`), ["2026-12:manual", "2026-11:autopay"]);
  const auto = await receiptFor(sql, list.receipts[1].key, "owner");
  assert.equal(auto.paidOn, "2026-11-05");
  assert.equal(auto.ref, "cf9");
});
