import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { SELLER, financialYear, invoiceAmounts, invoiceNumber, stateForCity } from "./invoice.ts";
import { dealSteps } from "./deal-steps.ts";
import { cancelAgreement, createFeeInvoice, signSquadAgreement, squadAgreementKey } from "./agreement-db.ts";

test("seller details on the invoice", () => {
  assert.equal(SELLER.gstin, "29ABFCA1830K1ZM");
  assert.equal(SELLER.state, "Karnataka");
  assert.match(SELLER.address, /62 MPT Road, Bunder, Mangaluru 575001/);
});

test("intra-state: ₹999 + CGST 89.91 + SGST 89.91, paid ₹1179 with +0.18 round off", () => {
  const a = invoiceAmounts(999, "Karnataka", 1179);
  assert.deepEqual([a.taxable, a.cgst, a.sgst, a.igst, a.total, a.roundOff, a.placeOfSupply], [99900, 8991, 8991, 0, 117882, 18, "Karnataka"]);
});

test("inter-state known buyer: IGST 18%; unknown state falls back to intra-state", () => {
  const a = invoiceAmounts(999, "Kerala", 1179);
  assert.deepEqual([a.cgst, a.sgst, a.igst, a.total, a.placeOfSupply], [0, 0, 17982, 117882, "Kerala"]);
  assert.equal(invoiceAmounts(999, null, 1179).intraState, true);
  assert.equal(stateForCity("Mangaluru"), "Karnataka");
  assert.equal(stateForCity("Kochi"), "Kerala");
  assert.equal(stateForCity("Atlantis"), null);
});

test("invoice number series per Indian FY (IST)", () => {
  assert.equal(financialYear(new Date("2026-10-29T05:00:00Z")), "2026-27");
  assert.equal(financialYear(new Date("2027-03-31T18:30:00Z")), "2027-28"); // 00:00 1 Apr 2027 IST
  assert.equal(financialYear(new Date("2027-03-31T18:29:00Z")), "2026-27");
  assert.equal(invoiceNumber(42, new Date("2026-10-29T05:00:00Z")), "RMO/2026-27/000042");
});

test("steps: Accepted → Sign → Pay → Move in, same for both sides", () => {
  const base = { role: "tenant" as const, iSigned: false, issued: false, cancelled: false, feeOn: true, feePaid: false, feeTotal: 1179, movedIn: false };
  const st = (o: Partial<typeof base>) => dealSteps({ ...base, ...o }).map((s) => s.state).join(",");
  assert.equal(st({}), "done,now,todo,todo");
  assert.equal(st({ issued: true, iSigned: true }), "done,done,now,todo");
  assert.equal(st({ issued: true, iSigned: true, feePaid: true }), "done,done,done,now");
  assert.equal(st({ issued: true, iSigned: true, feeOn: false }), "done,done,done,now");
  assert.equal(st({ issued: true, feePaid: true, movedIn: true }), "done,done,done,done");
  const pay = dealSteps({ ...base, role: "owner", issued: true, iSigned: true }).find((s) => s.key === "pay")!;
  assert.match(pay.hint, /₹1179 once/);
  assert.match(pay.hint, /7 days/);
  assert.match(dealSteps({ ...base, iSigned: true }).find((s) => s.key === "sign")!.hint, /Waiting on the owner/);
  assert.match(dealSteps({ ...base, role: "owner", squad: true, iSigned: true }).find((s) => s.key === "sign")!.hint, /every squad member/);
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

test("squad agreement issues only when the owner and every member signed; cancel refunds all payers", async () => {
  const pg = await db(); const sql = sqlOf(pg);
  await pg.query(`insert into deal_agreements (id, application_id, listing_id, seeker_id, owner_id, terms_json, body, squad_request_id) values ('ag','${squadAgreementKey("rq1")}','l1','m1','own','{}','x','rq1')`);
  const sign = (u: string) => signSquadAgreement(sql, { requestId: "rq1", userId: u, ownerId: "own", memberIds: ["m1", "m2"], name: "Name " + u, ip: "9.9.9.9" });
  assert.equal((await sign("m1"))?.issued_at, null);
  await assert.rejects(sign("stranger"));
  assert.equal((await sign("own"))?.issued_at, null);
  assert.ok((await sign("m2"))?.issued_at);
  for (const [id, u] of [["p1", "m1"], ["p2", "m2"], ["p3", "own"]])
    await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, agreement_id) values ($1,$2,'fee',1179,'PAID','UPI',$3,'SUCCESS_FEE','l1','ag')`, [id, u, "R" + id]);
  await assert.rejects(cancelAgreement(sql, { applicationId: squadAgreementKey("rq1"), userId: "stranger", reason: "", parties: ["own", "m1", "m2"] }));
  const out = await cancelAgreement(sql, { applicationId: squadAgreementKey("rq1"), userId: "m2", reason: "", parties: ["own", "m1", "m2"] });
  assert.deepEqual(out, { refunds: 3, refundable: true });
  await pg.close();
});

test("GST invoice is created once per PAID fee with running numbers", async () => {
  const pg = await db(); const sql = sqlOf(pg);
  for (const [id, st] of [["p1", "PAID"], ["p2", "PAID"], ["p3", "PENDING"]])
    await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind) values ($1,'u1','fee',1179,$2,'UPI',$3,'SUCCESS_FEE')`, [id, st, "R" + id]);
  const now = new Date("2026-10-29T05:00:00Z");
  const a = await createFeeInvoice(sql, "p1", 999, now);
  const again = await createFeeInvoice(sql, "p1", 999, now);
  const b = await createFeeInvoice(sql, "p2", 999, now);
  assert.equal(a?.number, "RMO/2026-27/000001");
  assert.equal(again?.number, a?.number);
  assert.equal(b?.number, "RMO/2026-27/000002");
  assert.equal(await createFeeInvoice(sql, "p3", 999, now), null);
  const r = (await pg.query<{ cgst_paise: number; total_paise: number; round_off_paise: number; place_of_supply: string }>(`select cgst_paise, total_paise, round_off_paise, place_of_supply from fee_invoices where payment_id='p1'`)).rows[0];
  assert.deepEqual([r.cgst_paise, r.total_paise, r.round_off_paise, r.place_of_supply], [8991, 117882, 18, "Karnataka"]);
  await pg.close();
});
