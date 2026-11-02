import test from "node:test";
import assert from "node:assert/strict";
import { testDb, seedListing } from "./pgtest.ts";
import { bookTrial, confirmTrialFromPayment, setListingTrial } from "./trial-db.ts";
import { createFeeInvoice, createTrialInvoice } from "./agreement-db.ts";
import { invoicePdfLines, trialInvoiceNumber, invoiceNumber, invoiceAmountsInclusive } from "./invoice.ts";

test("₹99 breakup: ₹83.90 taxable + ₹15.10 GST (CGST 7.55 + SGST 7.55), no round-off", () => {
  const a = invoiceAmountsInclusive(99, "Karnataka");
  assert.deepEqual([a.taxable, a.cgst, a.sgst, a.igst, a.total, a.roundOff], [8390, 755, 755, 0, 9900, 0]);
  assert.equal(invoiceAmountsInclusive(99, "Kerala").igst, 1510);
  assert.equal(trialInvoiceNumber(7, new Date("2026-11-02T05:00:00Z")), "RMT/2026-27/000007");
  assert.notEqual(trialInvoiceNumber(1, new Date()), invoiceNumber(1, new Date()));
});

test("trial invoice only after admin approval, own RMT series, credit on ₹490 invoice references it", async () => {
  const { pg, sql } = await testDb();
  await seedListing(pg);
  await setListingTrial(sql, { listingId: "L1", ownerId: "owner", enabled: true, nightlyInr: "400" });
  const b = await bookTrial(sql, { listingId: "L1", seekerId: "tenant", checkIn: "2026-11-05", nights: 2, ref: "RMT1", now: new Date("2026-11-01T06:00:00Z") });
  const pid = (await pg.query<{ id: string }>(`select id from payments where ref = 'RMT1'`)).rows[0].id;
  assert.equal(await createTrialInvoice(sql, pid), null, "PENDING: no invoice");
  await pg.query(`update payments set status = 'SUBMITTED', utr = '412345678901' where id = $1`, [pid]);
  assert.equal(await createTrialInvoice(sql, pid), null, "SUBMITTED: no invoice");
  await pg.query(`update payments set status = 'PAID', reviewed_at = now() where id = $1`, [pid]);
  await confirmTrialFromPayment(sql, pid);
  const now = new Date("2026-11-02T05:00:00Z");
  const inv = await createTrialInvoice(sql, pid, now);
  assert.equal(inv?.number, "RMT/2026-27/000001");
  assert.equal((await createTrialInvoice(sql, pid, now))?.number, "RMT/2026-27/000001", "idempotent");
  const row = (await pg.query<Record<string, unknown>>(`select kind, trial_booking_id, taxable_paise, cgst_paise, sgst_paise, total_paise, utr from fee_invoices where payment_id = $1`, [pid])).rows[0];
  assert.deepEqual([row.kind, row.trial_booking_id, row.taxable_paise, Number(row.cgst_paise) + Number(row.sgst_paise), row.total_paise, row.utr], ["TRIAL_FEE", b.bookingId, 8390, 1510, 9900, "412345678901"]);
  // fee invoice series is separate
  await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, trial_credit_inr, trial_credit_booking_id) values ('f1','tenant','fee',490,'PAID','UPI','RF1','SUCCESS_FEE',99,$1)`, [b.bookingId]);
  const fi = await createFeeInvoice(sql, "f1", 415.25, now);
  assert.equal(fi?.number, "RMO/2026-27/000001");
  assert.deepEqual(await createTrialInvoice(sql, "f1"), fi, "not a trial payment: returns existing, no new RMT row");
  const n = (await pg.query<{ n: number }>(`select count(*)::int as n from fee_invoices where number like 'RMT/%'`)).rows[0].n;
  assert.equal(n, 1);
  await pg.close();
});

test("PDF lines: trial invoice content and credit reference", () => {
  const base = { number: "RMT/2026-27/000001", issuedAt: "2026-11-02T05:00:00Z", buyerName: "Sam", buyerEmail: "", buyerPhone: "", buyerGstin: "", buyerState: "Karnataka", placeOfSupply: "Karnataka",
    taxable: 8390, cgst: 755, sgst: 755, igst: 0, total: 9900, roundOff: 0, paidInr: 99, ref: "RMT1", utr: "412345678901", purpose: "" };
  const t = invoicePdfLines({ ...base, kind: "TRIAL_FEE", trial: { bookingId: "tb1", listingTitle: "Mud Home 6-sharing", checkIn: "2026-11-05", nights: 2 } }).map((l) => l.text).join("\n");
  for (const re of [/TAX INVOICE/, /RMT\/2026-27\/000001/, /trial night stay \(non-refundable\)/, /SAC 998599/, /29ABFCA1830K1ZM/, /Mud Home 6-sharing/, /2 night\(s\) \| Trial booking tb1/, /Taxable value: ₹83\.90/, /Tax rate: GST 18% \| Tax amount: ₹15\.10/, /CGST @ 9%: ₹7\.55/, /Invoice total: ₹99\.00/, /UTR: 412345678901/, /Place of supply: Karnataka/])
    assert.match(t, re);
  const f = invoicePdfLines({ ...base, number: "RMO/2026-27/000001", taxable: 41525, cgst: 3737, sgst: 3738, total: 49000, paidInr: 490, trialCreditInr: 99, trialInvoiceNo: "RMT/2026-27/000001" }).map((l) => l.text).join("\n");
  assert.match(f, /invoiced on RMT\/2026-27\/000001/);
});
