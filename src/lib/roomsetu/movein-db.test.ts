// Migration 0019 + move-in/deposit SQL against in-memory PGlite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb, seedListing, migrationsDir } from "./pgtest.ts";
import { ackDeposit, addDeduction, agreementDoc, createInvite, deductionPhoto, idDoc, listMoveIns, markRefunded, openInvite, policeForm, recordDeposit, setCheckout, signAgreement, submitDetails } from "./movein-db.ts";
import { parseDetails } from "./movein.ts";

const details = parseDetails({ fullName: "Asha Tenant", phone: "9845012345", homeAddress: "12 MG Road, Indiranagar", homeCity: "Bengaluru", homeState: "Karnataka", homePincode: "560038", idType: "AADHAAR", idNumber: "2345 6789 0123", employer: "Infosys" });
const meta = { ip: "1.2.3.4", userAgent: "test" };

test("migration 0019 re-runs cleanly", async () => {
  const { pg } = await testDb();
  await pg.exec(readFileSync(new URL("0019_move_in_deposits.sql", migrationsDir), "utf8"));
});

test("move-in: invite → claim → details + private ID → e-sign → police form", async () => {
  const { pg, sql } = await testDb();
  await seedListing(pg);
  await assert.rejects(createInvite(sql, "stranger", { listingId: "L1", bedLabel: "", rentInr: null, depositInr: null, startDate: "2026-11-01", houseRules: "" }));
  const { id, token } = await createInvite(sql, "owner", { listingId: "L1", bedLabel: "B2", rentInr: null, depositInr: null, startDate: "2026-11-01", houseRules: "" });
  const opened = await openInvite(sql, token, "tenant");
  assert.equal(opened.role, "tenant");
  assert.equal(Number(opened.inv.rent_inr), 8999);
  await assert.rejects(openInvite(sql, token, "intruder"), /not found/);
  await assert.rejects(idDoc(sql, id, "intruder"));
  await assert.rejects(signAgreement(sql, id, "tenant", "Asha Tenant", meta), /details/);

  const r = await submitDetails(sql, id, "tenant", details, { mime: "image/jpeg", base64: "AAAA" });
  assert.equal(r.outsideMangaluru, true);
  const stored = JSON.stringify((await pg.query(`select * from movein_details`)).rows);
  assert.ok(!stored.includes("234567890123"), "full Aadhaar never stored");
  assert.equal(await idDoc(sql, id, "owner"), "data:image/jpeg;base64,AAAA");

  await assert.rejects(signAgreement(sql, id, "tenant", "Someone Else", meta), /exactly/);
  await assert.rejects(signAgreement(sql, id, "owner", "Asha Tenant", meta));
  assert.deepEqual(await signAgreement(sql, id, "tenant", "  asha tenant ", meta), { signed: true, already: false });
  assert.equal((await signAgreement(sql, id, "tenant", "Asha Tenant", meta)).already, true);
  const doc = await agreementDoc(sql, id, "owner");
  assert.equal(doc.signature?.ip, "1.2.3.4");
  assert.match(doc.signature!.agreement_sha256, /^[0-9a-f]{64}$/);
  assert.match(doc.signature!.signed_at, /^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} [AP]M IST$/);

  await assert.rejects(policeForm(sql, id, "tenant"));
  const form = (await policeForm(sql, id, "owner")).map((l) => l.text).join("\n");
  assert.match(form, /XXXX XXXX 0123/);
  assert.match(form, /YES/);
});

test("deposits: record → deduction w/ photo → tenant ack → checkout → refund", async () => {
  const { pg, sql } = await testDb();
  await seedListing(pg);
  const { id, token } = await createInvite(sql, "owner", { listingId: "L1", bedLabel: "", rentInr: 9000, depositInr: 9000, startDate: "2026-11-01", houseRules: "" });
  await openInvite(sql, token, "tenant");
  await assert.rejects(recordDeposit(sql, id, "tenant", 9000, "2026-11-01"));
  await recordDeposit(sql, id, "owner", 9000, "2026-11-01");
  let [mi] = await listMoveIns(sql, "tenant");
  const depId = mi.deposit!.id;
  await assert.rejects(addDeduction(sql, depId, "owner", 10000, "too much", null), /left/);
  await addDeduction(sql, depId, "owner", 1500, "Broken chair", "BBBB");
  assert.equal(await deductionPhoto(sql, mi.deposit!.deductions[0]?.id ?? (await listMoveIns(sql, "owner"))[0].deposit!.deductions[0].id, "tenant"), "data:image/jpeg;base64,BBBB");
  await assert.rejects(ackDeposit(sql, depId, "owner"));
  await ackDeposit(sql, depId, "tenant");
  assert.equal(await setCheckout(sql, depId, "owner", "2027-02-01"), "2027-02-08");
  await assert.rejects(markRefunded(sql, depId, "owner", 9000, "2027-02-05", "UTR"), /7500/);
  await markRefunded(sql, depId, "owner", 7500, "2027-02-05", "UTR123");
  [mi] = await listMoveIns(sql, "tenant");
  assert.equal(mi.deposit!.status, "REFUNDED");
  assert.equal(mi.deposit!.balanceInr, 7500);
  assert.ok(mi.deposit!.tenantAckAt);
  assert.ok(mi.deposit!.deductions[0].tenantAckAt);
  assert.deepEqual(await listMoveIns(sql, "intruder"), []);
});
