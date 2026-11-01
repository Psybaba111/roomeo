import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { agreementBody, agreementState, feeBreakdownText, feeWithGst, refundableOnVacate, refundDeadline, validSignName } from "./deal-agreement.ts";
import { cancelAgreement, recordVacate, signAgreement } from "./agreement-db.ts";

test("₹999 + 18% GST = ₹1,178.82, charged ₹1,179", () => {
  assert.deepEqual(feeWithGst(999), { base: 999, gst: 179.82, exact: 1178.82, total: 1179 });
  assert.match(feeBreakdownText(999), /₹999 \+ ₹179\.82 GST \(18%\) = ₹1178\.82, rounded to ₹1179/);
  assert.equal(feeWithGst(0).total, 0);
});

test("₹499 + 18% GST = ₹588.82, charged ₹589 per side", () => {
  assert.deepEqual(feeWithGst(499), { base: 499, gst: 89.82, exact: 588.82, total: 589 });
});

test("refund only if vacated within 7 days of payment (India dates)", () => {
  const paid = "2026-11-01T04:30:00Z"; // 10:00 IST, 1 Nov
  assert.equal(refundDeadline(paid), "2026-11-08");
  assert.equal(refundableOnVacate(paid, "2026-11-08"), true);
  assert.equal(refundableOnVacate(paid, "2026-11-09"), false);
  assert.equal(refundableOnVacate(paid, "2026-11-01"), true);
  assert.equal(refundableOnVacate("2026-10-31T19:00:00Z", "2026-11-08"), true); // 00:30 IST 1 Nov
  assert.equal(refundableOnVacate(null, "2026-11-02"), false);
});

test("agreement state + sign name + body", () => {
  assert.equal(agreementState({}), "DRAFT");
  assert.equal(agreementState({ seekerSignedAt: "x" }), "WAITING");
  assert.equal(agreementState({ seekerSignedAt: "x", ownerSignedAt: "y", issuedAt: "z" }), "ISSUED");
  assert.equal(agreementState({ issuedAt: "z", cancelledAt: "c" }), "CANCELLED");
  assert.equal(validSignName("  Asha   K "), "Asha K");
  assert.throws(() => validSignName("a"));
  const b = agreementBody({ listingTitle: "AC 2-sharing", address: "MPT Rd", city: "Mangaluru", locality: "Bunder", monthlyRent: 8999, deposit: 8999, moveIn: "2026-11-01", tenantName: "T", ownerName: "O", feeBaseInr: 999 });
  assert.match(b, /₹8999/);
  assert.match(b, /₹1178\.82/);
  assert.match(b, /7 days/);
  assert.match(b, /IP address/);
});

const dir = new URL("../../../migrations/", import.meta.url);
async function db() {
  const pg = new PGlite();
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) await pg.exec(readFileSync(new URL(f, dir), "utf8"));
  return pg;
}
function sqlOf(pg: PGlite) {
  const fn = (async () => { throw new Error("tagged form unused"); }) as unknown as import("../db.ts").Sql;
  fn.query = async (text: string, params?: unknown[]) => (await pg.query(text, params)).rows as never;
  return fn;
}
async function seed(pg: PGlite) {
  await pg.query(`insert into deal_agreements (id, application_id, listing_id, seeker_id, owner_id, terms_json, body) values ('ag1','app1','l1','ten','own','{}','x')`);
}
const pay = (pg: PGlite, id: string, user: string, status: string) =>
  pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, agreement_id) values ($1,$2,'Success fee',1179,$3,'UPI',$4,'SUCCESS_FEE','l1','ag1')`, [id, user, status, "RF" + id]);

test("both sign → issued with name + IP; strangers can't sign", async () => {
  const pg = await db(); const sql = sqlOf(pg); await seed(pg);
  let a = await signAgreement(sql, { applicationId: "app1", userId: "ten", name: "Tenant T", ip: "1.2.3.4" });
  assert.equal(a?.issued_at, null);
  await assert.rejects(signAgreement(sql, { applicationId: "app1", userId: "zzz", name: "X Y", ip: "" }));
  a = await signAgreement(sql, { applicationId: "app1", userId: "own", name: "Owner O", ip: "5.6.7.8" });
  assert.ok(a?.issued_at);
  const r = (await pg.query<{ seeker_ip: string; owner_name: string }>(`select seeker_ip, owner_name from deal_agreements where id='ag1'`)).rows[0];
  assert.equal(r.seeker_ip, "1.2.3.4"); assert.equal(r.owner_name, "Owner O");
  await pg.close();
});

const payAt = (pg: PGlite, id: string, user: string, at: string) =>
  pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, agreement_id, reviewed_at) values ($1,$2,'fee',589,'PAID','UPI',$1,'SUCCESS_FEE','l1','ag1',$3::timestamptz)`, [id, user, at]);

test("move-out within 7 days of payment refunds renter + owner fees; admin can't record twice", async () => {
  const pg = await db(); const sql = sqlOf(pg); await seed(pg);
  await payAt(pg, "t1", "ten", "2026-11-01T05:00:00Z"); await payAt(pg, "o1", "own", "2026-10-20T05:00:00Z");
  const out = await recordVacate(sql, { applicationId: "app1", vacatedOn: "2026-11-07", actorId: "adm", today: new Date("2026-11-10T00:00:00Z") });
  assert.deepEqual(out, { refunds: 1, kept: 1 }); // owner paid 18 days earlier: kept
  const st = Object.fromEntries((await pg.query<{ id: string; status: string }>(`select id, status from payments order by id`)).rows.map((x) => [x.id, x.status]));
  assert.deepEqual(st, { o1: "PAID", t1: "REFUND_DUE" });
  await assert.rejects(recordVacate(sql, { applicationId: "app1", vacatedOn: "2026-11-07", actorId: "adm", today: new Date("2026-11-10T00:00:00Z") }), /already recorded/);
  await pg.close();
});

test("move-out after 7 days: no refund; future dates refused", async () => {
  const pg = await db(); const sql = sqlOf(pg); await seed(pg);
  await payAt(pg, "t1", "ten", "2026-11-01T05:00:00Z");
  await assert.rejects(recordVacate(sql, { applicationId: "app1", vacatedOn: "2026-12-01", actorId: "adm", today: new Date("2026-11-10T00:00:00Z") }), /future/);
  const out = await recordVacate(sql, { applicationId: "app1", vacatedOn: "2026-11-09", actorId: "adm", today: new Date("2026-11-10T00:00:00Z") });
  assert.deepEqual(out, { refunds: 0, kept: 1 });
  await pg.close();
});

test("cancel within 7 days of payment refunds BOTH sides' paid fees; unpaid checkouts closed", async () => {
  const pg = await db(); const sql = sqlOf(pg); await seed(pg);
  await pg.query(`update deal_agreements set seeker_signed_at=now(), owner_signed_at=now(), issued_at=now() where id='ag1'`);
  await pay(pg, "p1", "ten", "PAID"); await pay(pg, "p2", "own", "PAID"); await pay(pg, "p3", "ten", "PENDING");
  const out = await cancelAgreement(sql, { applicationId: "app1", userId: "own", reason: "changed mind" });
  assert.deepEqual(out, { refunds: 2, refundable: true });
  const st = Object.fromEntries((await pg.query<{ id: string; status: string }>(`select id, status from payments order by id`)).rows.map((x) => [x.id, x.status]));
  assert.deepEqual(st, { p1: "REFUND_DUE", p2: "REFUND_DUE", p3: "CANCELLED" });
  await pg.close();
});

test("cancel more than 7 days after payment: no refund", async () => {
  const pg = await db(); const sql = sqlOf(pg); await seed(pg);
  await pg.query(`update deal_agreements set seeker_signed_at=now(), owner_signed_at=now(), issued_at=now() - interval '8 days' where id='ag1'`);
  await pay(pg, "p1", "ten", "PAID");
  await pg.query(`update payments set created_at = now() - interval '9 days', reviewed_at = now() - interval '9 days' where id='p1'`);
  const out = await cancelAgreement(sql, { applicationId: "app1", userId: "ten", reason: "" });
  assert.deepEqual(out, { refunds: 0, refundable: false });
  assert.equal((await pg.query<{ status: string }>(`select status from payments where id='p1'`)).rows[0].status, "PAID");
  await pg.close();
});
