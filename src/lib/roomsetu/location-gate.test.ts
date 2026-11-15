import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import { locationAccess, locationUnlocked, lockedLine, mapsUrl } from "./location-gate.ts";
import { FEE_OFF } from "./fee-copy.ts";

const none = { isOwner: false, isAdmin: false, signed: false, paid: false };

test("location stays locked until the fee condition AND signature are both met", () => {
  assert.equal(locationUnlocked(none), false);
  assert.equal(locationUnlocked({ ...none, paid: true }), false);
  assert.equal(locationUnlocked({ ...none, signed: true }), false);
  assert.equal(locationUnlocked({ ...none, signed: true, paid: true }), true);
});

test("owner and admin always see the exact location", () => {
  assert.equal(locationUnlocked({ ...none, isOwner: true }), true);
  assert.equal(locationUnlocked({ ...none, isAdmin: true }), true);
});

test("maps link prefers the exact pin, falls back to the street address", () => {
  const pin = mapsUrl("MPT Road, Bunder, Mangaluru, Karnataka 575001", "575001", 12.867513, 74.834487);
  assert.equal(pin, "https://www.google.com/maps/search/?api=1&query=12.867513%2C74.834487");
  const text = decodeURIComponent(mapsUrl("MPT Road, Bunder, Mangaluru, Karnataka 575001", "575001", 0, 0));
  assert.ok(text.includes("MPT Road, Bunder") && !text.includes("575001 575001"));
  assert.ok(decodeURIComponent(mapsUrl("MPT Road", "575001", Number.NaN, 74.8)).endsWith("MPT Road 575001"));
  assert.equal(mapsUrl("", "", 0, 0), "");
});

test("locked line names both conditions when the fee is on; no fee when off", () => {
  const on = lockedLine({ on: true, baseInr: 499, totalInr: 589 });
  assert.match(on, /sign the agreement/);
  assert.match(on, /589/);
  const off = lockedLine(FEE_OFF);
  assert.match(off, /both sign the agreement/);
  assert.doesNotMatch(off, /₹\d|589|499/);
  assert.equal(lockedLine(), off);
});

// --- DB-backed gate (PGLite + real migrations) ---
const dir = new URL("../../../migrations/", import.meta.url);
async function db() {
  const pg = new PGlite();
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) await pg.exec(readFileSync(new URL(f, dir), "utf8"));
  return pg;
}
function sqlOf(pg: PGlite): Sql {
  const fn = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return (await pg.query(text, values)).rows;
  }) as unknown as Sql;
  fn.query = async (text: string, params?: unknown[]) => (await pg.query(text, params)).rows as never;
  return fn;
}
async function agreement(pg: PGlite, opts: { tenantSigned: boolean; issued: boolean }) {
  await pg.query(
    `insert into deal_agreements (id, application_id, listing_id, seeker_id, owner_id, terms_json, body, seeker_signed_at, owner_signed_at, issued_at)
     values ('ag1','app1','l1','ten','own','{}','x', $1, $2, $2)`,
    [opts.tenantSigned ? new Date().toISOString() : null, opts.issued ? new Date().toISOString() : null],
  );
}
const paidFee = (pg: PGlite) =>
  pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, agreement_id) values ('p1','ten','Success fee',589,'PAID','UPI','RF1','SUCCESS_FEE','l1','ag1')`);

test("fee OFF: a fully signed (issued) agreement unlocks the exact location, no payment needed", async () => {
  const pg = await db();
  await agreement(pg, { tenantSigned: true, issued: true });
  const access = await locationAccess(sqlOf(pg), "l1", "own", "ten", false);
  assert.equal(locationUnlocked(access), true);
  await pg.close();
});

test("fee OFF: renter signed but the owner hasn't yet → still locked", async () => {
  const pg = await db();
  await agreement(pg, { tenantSigned: true, issued: false });
  const access = await locationAccess(sqlOf(pg), "l1", "own", "ten", false);
  assert.deepEqual(access, { isOwner: false, isAdmin: false, signed: true, paid: false });
  assert.equal(locationUnlocked(access), false);
  await pg.close();
});

test("fee OFF: no agreement, stranger or signed-out → locked; owner → open", async () => {
  const pg = await db();
  await agreement(pg, { tenantSigned: true, issued: true });
  const sql = sqlOf(pg);
  assert.equal(locationUnlocked(await locationAccess(sql, "l1", "own", "someone-else", false)), false);
  assert.equal(locationUnlocked(await locationAccess(sql, "l1", "own", null, false)), false);
  assert.equal(locationUnlocked(await locationAccess(sql, "other-listing", "own", "ten", false)), false);
  assert.equal(locationUnlocked(await locationAccess(sql, "l1", "own", "own", false)), true);
  await pg.close();
});

test("fee ON: issued agreement still needs the PAID fee", async () => {
  const pg = await db();
  await agreement(pg, { tenantSigned: true, issued: true });
  const sql = sqlOf(pg);
  assert.equal(locationUnlocked(await locationAccess(sql, "l1", "own", "ten", true)), false);
  await paidFee(pg);
  assert.equal(locationUnlocked(await locationAccess(sql, "l1", "own", "ten", true)), true);
  await pg.close();
});

test("cancelled agreement never unlocks, fee on or off", async () => {
  const pg = await db();
  await agreement(pg, { tenantSigned: true, issued: true });
  await paidFee(pg);
  await pg.query(`update deal_agreements set cancelled_at = now() where id = 'ag1'`);
  const sql = sqlOf(pg);
  assert.equal(locationUnlocked(await locationAccess(sql, "l1", "own", "ten", false)), false);
  assert.equal(locationUnlocked(await locationAccess(sql, "l1", "own", "ten", true)), false);
  await pg.close();
});
