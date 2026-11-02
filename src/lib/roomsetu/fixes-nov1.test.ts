import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { invoiceAmountsInclusive, invoicePdfLines } from "./invoice.ts";
import { createFeeInvoice, refundFeesForStayEnd } from "./agreement-db.ts";
import { findUser, grantAdmin, adminCount, parseIdentifier, type Query } from "./admin-bootstrap.ts";

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
const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("move-out refunds only admin-approved fees; unapproved ones are cancelled", async () => {
  const pg = await db(); const sql = sqlOf(pg);
  for (const [id, st] of [["a", "PAID"], ["b", "SUBMITTED"], ["c", "PENDING"]])
    await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, agreement_id, reviewed_at, created_at) values ($1,'u','fee',589,$2,'UPI',$3,'SUCCESS_FEE','ag', now(), now())`, [id, st, "R" + id]);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const out = await refundFeesForStayEnd(sql, "ag", today, "moved out");
  assert.deepEqual(out, { refunds: 1, kept: 0 });
  const rows = (await pg.query<{ id: string; status: string }>(`select id, status from payments order by id`)).rows;
  assert.deepEqual(rows.map((r) => r.status), ["REFUND_DUE", "CANCELLED", "CANCELLED"]);
  await pg.close();
});

test("admin bootstrap finds and grants a user who never finished onboarding", async () => {
  const pg = await db();
  const q: Query = async (t, p) => (await pg.query(t, p)).rows as Record<string, unknown>[];
  await pg.query(`insert into "user" (id, name, email, "emailVerified") values ('u9','Neha','neha@example.com', true)`);
  const u = await findUser(q, parseIdentifier("Neha@example.com"));
  assert.deepEqual(u, { userId: "u9", name: "Neha" });
  assert.deepEqual(await grantAdmin(q, "u9"), { granted: true });
  assert.equal(await adminCount(q), 1);
  await pg.close();
});

test("₹490 credited fee: taxable 415.25 exact, no round-off, trial credit line", async () => {
  const a = invoiceAmountsInclusive(490, "Karnataka");
  assert.deepEqual([a.taxable, a.cgst, a.sgst, a.igst, a.total, a.roundOff], [41525, 3737, 3738, 0, 49000, 0]);
  assert.equal(invoiceAmountsInclusive(490, "Kerala").igst, 7475);
  const pg = await db(); const sql = sqlOf(pg);
  await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, trial_credit_inr) values ('p','u','fee',490,'PAID','UPI','R1','SUCCESS_FEE',99)`);
  await createFeeInvoice(sql, "p", 415.25, new Date("2026-11-01T05:00:00Z"));
  const r = (await pg.query<{ taxable_paise: number; total_paise: number; round_off_paise: number }>(`select taxable_paise, total_paise, round_off_paise from fee_invoices where payment_id='p'`)).rows[0];
  assert.deepEqual([r.taxable_paise, r.total_paise, r.round_off_paise], [41525, 49000, 0]);
  await pg.close();
  const lines = invoicePdfLines({ number: "N", issuedAt: "2026-11-01", buyerName: "B", buyerEmail: "", buyerPhone: "", buyerGstin: "", buyerState: "Karnataka", placeOfSupply: "Karnataka",
    taxable: 41525, cgst: 3737, sgst: 3738, igst: 0, total: 49000, roundOff: 0, paidInr: 490, ref: "R", utr: "", purpose: "", trialCreditInr: 99 }).map((l) => l.text);
  assert.ok(lines.some((t) => /Less trial nights service fee already paid: -₹99\.00/.test(t)));
  assert.ok(!lines.some((t) => /Round off/.test(t)));
  assert.match(src("lib/roomsetu/pricing-db.ts"), /\* 100\) \/ 100/);
});

test("city pickers are not locked to OPEN_CITIES and the room-wanted city starts empty with a placeholder", () => {
  assert.equal(existsSync(new URL("./open-cities.ts", import.meta.url)), false);
  for (const f of ["routes/create-room-wanted.tsx", "routes/room-wanted.tsx", "components/auth-panel.tsx", "routes/search.tsx", "routes/create-listing.tsx"])
    assert.doesNotMatch(src(f), /OPEN_CITIES/, f);
  const rw = src("routes/create-room-wanted.tsx");
  assert.match(rw, /placeholder="Choose a city/);
  assert.match(rw, /list="room-wanted-cities"/);
  assert.match(rw, /cityRef\.current\?\.focus\(\)/);
  assert.match(rw, /role="alert"/);
  assert.match(src("lib/roomsetu/account-api.ts"), /city: text\(o\.city, 60, "City", true\)/);
  assert.doesNotMatch(src("lib/roomsetu/agreement-api.ts"), /₹999 \+ GST/);
});
