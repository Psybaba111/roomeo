// Waitlist on throwaway PGlite DBs. ZZ TEST / @example.com only.
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { testDb, migrationsDir } from "./pgtest.ts";
import { joinWaitlist, listWaitlist, WAITLIST_TABLE_MISSING } from "./waitlist-db.ts";
import { validateWaitlist } from "./waitlist.ts";

const base = { name: "ZZ TEST Asha", contact: "zz.test.asha@example.com", city: "Mangaluru", role: "tenant", consent: true };
const w = (o: Record<string, unknown> = {}) => validateWaitlist({ ...base, ...o });

test("join stores one row per person, dedupes on email/phone, logs waitlist_join once", async () => {
  const { pg, sql } = await testDb();
  assert.equal((await joinWaitlist(sql, w({ roomieType: "tidy", source: "quiz" }))).status, "joined");
  // Same email, different case: updates (role/city/type), no second row, no second event.
  assert.equal((await joinWaitlist(sql, w({ contact: "ZZ.TEST.ASHA@example.com", city: "Bengaluru", role: "owner" }))).status, "updated");
  assert.equal((await joinWaitlist(sql, w({ name: "ZZ TEST Ravi", contact: "+91 98450 12345", role: "owner" }))).status, "joined");
  assert.equal((await joinWaitlist(sql, w({ name: "ZZ TEST Ravi", contact: "9845012345", roomieType: "hype" }))).status, "updated");
  const list = await listWaitlist(sql);
  assert.equal(list.total, 2);
  const asha = list.rows.find((r) => r.email === "zz.test.asha@example.com")!;
  assert.equal(asha.city, "Bengaluru");
  assert.equal(asha.role, "owner");
  assert.equal(asha.roomieType, "tidy"); // a later sign-up without a type keeps the saved one
  const ravi = list.rows.find((r) => r.phone === "9845012345")!;
  assert.equal(ravi.roomieType, "hype");
  assert.deepEqual(list.byRole, { owner: 1, tenant: 1 });
  const ev = await pg.query<{ kind: string; city: string }>(`select kind, city from metric_events where kind = 'waitlist_join' order by created_at`);
  assert.equal(ev.rows.length, 2);
  // The DB itself refuses rows without consent or contact.
  await assert.rejects(pg.query(`insert into waitlist_signups (id, name, city, role, consent_at) values ('x','ZZ','Pune','tenant',now())`));
  await assert.rejects(pg.query(`insert into waitlist_signups (id, name, email, city, role) values ('y','ZZ','zz@example.com','Pune','tenant')`));
});

test("migration 0029 needs neither 0027 nor 0028", async () => {
  const pg = new PGlite();
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql") && n < "0027").sort()) await pg.exec(readFileSync(new URL(f, migrationsDir), "utf8"));
  await pg.exec(readFileSync(new URL("0029_waitlist_signups.sql", migrationsDir), "utf8"));
  await pg.exec(readFileSync(new URL("0029_waitlist_signups.sql", migrationsDir), "utf8")); // safe to re-run
  const sql = { query: async (t: string, p?: unknown[]) => (await pg.query(t, p)).rows } as never;
  assert.equal((await joinWaitlist(sql, w())).status, "joined");
  assert.equal((await listWaitlist(sql)).total, 1);
});

test("a DB without 0029 refuses to save and lists nothing", async () => {
  const pg = new PGlite();
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql") && n < "0029").sort()) await pg.exec(readFileSync(new URL(f, migrationsDir), "utf8"));
  const sql = { query: async (t: string, p?: unknown[]) => (await pg.query(t, p)).rows } as never;
  await assert.rejects(joinWaitlist(sql, w()), new RegExp(WAITLIST_TABLE_MISSING.slice(0, 20)));
  assert.deepEqual(await listWaitlist(sql), { rows: [], total: 0, byRole: {} });
});
