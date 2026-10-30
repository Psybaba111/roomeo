// Signed move-in agreement = confirmed move-in, through the same path as the in-app confirm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { testDb, seedListing } from "./pgtest.ts";
import { createInvite, openInvite, signAgreement, submitDetails } from "./movein-db.ts";
import { parseDetails } from "./movein.ts";
import { confirmMoveInRecord } from "./movein-confirm.ts";

const details = parseDetails({ fullName: "Asha Tenant", phone: "9845012345", homeAddress: "12 MG Road", homeCity: "Bengaluru", homeState: "Karnataka", homePincode: "560038", idType: "AADHAAR", idNumber: "2345 6789 0123" });
const meta = { ip: "1.2.3.4", userAgent: "test" };

async function setup(withReferral = true) {
  const { pg, sql } = await testDb();
  await seedListing(pg);
  if (withReferral) await pg.query(`insert into referrals (id, referrer_id, referee_id, code) values ('R1','friend','tenant','ABC1234')`);
  const { id, token } = await createInvite(sql, "owner", { listingId: "L1", bedLabel: "B1", rentInr: null, depositInr: null, startDate: "2026-11-01", houseRules: "" });
  await openInvite(sql, token, "tenant");
  await submitDetails(sql, id, "tenant", details, { mime: "image/jpeg", base64: "AAAA" });
  const count = async (q: string) => Number((await pg.query<{ n: number }>(q)).rows[0].n);
  return { pg, sql, id, count };
}

async function withFlag<T>(on: boolean, fn: () => Promise<T>) {
  const prev = process.env.ROOMEO_REFERRALS_ENABLED;
  process.env.ROOMEO_REFERRALS_ENABLED = on ? "true" : "false";
  try { return await fn(); } finally { if (prev === undefined) delete process.env.ROOMEO_REFERRALS_ENABLED; else process.env.ROOMEO_REFERRALS_ENABLED = prev; }
}

test("signing the agreement creates a confirmed move-in and credits the referral", () => withFlag(true, async () => {
  const { sql, id, count } = await setup();
  await signAgreement(sql, id, "tenant", "Asha Tenant", meta);
  assert.equal(await count(`select count(*)::int n from move_ins where seeker_id='tenant' and listing_id='L1' and confirmed_at is not null and owner_id='owner'`), 1);
  assert.equal(await count(`select count(*)::int n from referral_credits`), 2);
  assert.equal(await count(`select count(*)::int n from referrals where completed_at is not null`), 1);
}));

test("re-sign + old in-app confirm → one move-in, one credit pair", () => withFlag(true, async () => {
  const { pg, sql, id, count } = await setup();
  await pg.query(`insert into applications (id, listing_id, seeker_id, host_id, status) values ('A1','L1','tenant','owner','ACCEPTED')`);
  await signAgreement(sql, id, "tenant", "Asha Tenant", meta);
  await signAgreement(sql, id, "tenant", "Asha Tenant", meta);
  for (const side of ["seeker", "owner"] as const)
    await confirmMoveInRecord(sql, { applicationId: "A1", listingId: "L1", seekerId: "tenant", ownerId: "owner", side, notifyUserId: null });
  assert.equal(await count(`select count(*)::int n from move_ins`), 1);
  assert.equal(await count(`select count(*)::int n from move_ins where application_id='A1' and confirmed_at is not null`), 1);
  assert.equal(await count(`select count(*)::int n from referral_credits`), 2);
  assert.equal(await count(`select count(*)::int n from notifications where title='Move in confirmed'`), 1);
}));

test("old in-app confirm first, then sign → still one move-in, one credit pair", () => withFlag(true, async () => {
  const { pg, sql, id, count } = await setup();
  await pg.query(`insert into applications (id, listing_id, seeker_id, host_id, status) values ('A1','L1','tenant','owner','ACCEPTED')`);
  for (const side of ["seeker", "owner"] as const)
    await confirmMoveInRecord(sql, { applicationId: "A1", listingId: "L1", seekerId: "tenant", ownerId: "owner", side, notifyUserId: "owner" });
  await signAgreement(sql, id, "tenant", "Asha Tenant", meta);
  assert.equal(await count(`select count(*)::int n from move_ins`), 1);
  assert.equal(await count(`select count(*)::int n from referral_credits`), 2);
}));

test("referrals flag off → signed move-in confirmed, no credit", () => withFlag(false, async () => {
  const { sql, id, count } = await setup();
  await signAgreement(sql, id, "tenant", "Asha Tenant", meta);
  assert.equal(await count(`select count(*)::int n from move_ins where confirmed_at is not null`), 1);
  assert.equal(await count(`select count(*)::int n from referral_credits`), 0);
  assert.equal(await count(`select count(*)::int n from referrals where completed_at is not null`), 0);
}));
