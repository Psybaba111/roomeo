// Migration 0021 + bed board / meals / notices SQL against in-memory PGlite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb, seedListing, migrationsDir } from "./pgtest.ts";
import { bedBoard, deleteNotice, markNoticeRead, noticesFor, ownerHeadcount, postNotice, relistBed, saveBed, setMealSkip } from "./pg-ops-db.ts";
import { parseBed } from "./pg-ops.ts";

const ist = (s: string) => new Date(`${s}+05:30`);
async function setup() {
  const t = await testDb();
  await seedListing(t.pg);
  await t.pg.query(`insert into move_ins (id, listing_id, seeker_id, owner_id, confirmed_at) values ('mi1','L1','tenant','owner', now())`);
  return t;
}

test("migration 0021 re-runs cleanly", async () => {
  const { pg } = await testDb();
  await pg.exec(readFileSync(new URL("0021_pg_ops.sql", migrationsDir), "utf8"));
});

test("bed board: add beds, link resident, relist vacant / on-notice", async () => {
  const { pg, sql } = await setup();
  await assert.rejects(saveBed(sql, "stranger", "L1", null, parseBed({ label: "B1", status: "VACANT" })));
  await assert.rejects(saveBed(sql, "owner", "L1", null, parseBed({ label: "B1", status: "OCCUPIED" }), "stranger"), /moved in/);
  let board = await bedBoard(sql, "owner");
  assert.equal(board.listings[0].unplaced[0].userId, "tenant");
  // A signed move-in seeds the agreed move-in date, not the day it was signed.
  await pg.query(`insert into movein_invites (id, token, listing_id, owner_id, tenant_id, rent_inr, start_date, status) values ('inv1','tok1','L1','owner','tenant',8999,'2026-11-01','SIGNED')`);
  board = await bedBoard(sql, "owner");
  assert.equal(board.listings[0].unplaced[0].since, "2026-11-01");
  await saveBed(sql, "owner", "L1", null, parseBed({ label: "B1", status: "OCCUPIED", tenantName: "Asha", moveInDate: "2026-11-01" }), "tenant");
  const b2 = await saveBed(sql, "owner", "L1", null, parseBed({ label: "B2", status: "ON_NOTICE", tenantName: "Ravi", noticeEnd: "2026-11-30" }));
  const b3 = await saveBed(sql, "owner", "L1", null, parseBed({ label: "B3", status: "VACANT" }));
  board = await bedBoard(sql, "owner");
  assert.deepEqual(board.summary, { total: 3, occupied: 1, vacant: 1, onNotice: 1, blocked: 0 });
  assert.equal(board.listings[0].unplaced.length, 0);

  await pg.query(`update listings set status = 'OCCUPIED' where id = 'L1'`);
  assert.deepEqual(await relistBed(sql, "owner", b2, ist("2026-11-02T09:00:00")), { listingId: "L1", availableFrom: "2026-12-01" });
  const l = (await pg.query<{ status: string; available_from: string }>(`select status, available_from::text as available_from from listings where id = 'L1'`)).rows[0];
  assert.deepEqual(l, { status: "ACTIVE", available_from: "2026-12-01" });
  await relistBed(sql, "owner", b3, ist("2026-11-02T09:00:00"));
  await assert.rejects(relistBed(sql, "stranger", b3, new Date()));
  await pg.query(`update listings set status = 'PAUSED' where id = 'L1'`);
  await assert.rejects(relistBed(sql, "owner", b3, new Date()), /paused/);
  const occupied = board.listings[0].beds.find((b) => b.label === "B1")!;
  await assert.rejects(relistBed(sql, "owner", occupied.id, new Date()), /vacant or on-notice/);
});

test("meals: resident skips before 11 AM, owner headcount", async () => {
  const { sql } = await setup();
  await saveBed(sql, "owner", "L1", null, parseBed({ label: "B1", status: "OCCUPIED" }), "tenant");
  await saveBed(sql, "owner", "L1", null, parseBed({ label: "B2", status: "OCCUPIED", tenantName: "Ravi" }));
  await saveBed(sql, "owner", "L1", null, parseBed({ label: "B3", status: "VACANT" }));
  await assert.rejects(setMealSkip(sql, "stranger", "L1", "2026-11-02", "LUNCH", true, ist("2026-11-02T08:00:00")), /own PG/);
  await assert.rejects(setMealSkip(sql, "tenant", "L1", "2026-11-02", "LUNCH", true, ist("2026-11-02T11:30:00")), /11 AM/);
  await setMealSkip(sql, "tenant", "L1", "2026-11-02", "LUNCH", true, ist("2026-11-02T08:00:00"));
  await setMealSkip(sql, "tenant", "L1", "2026-11-02", "LUNCH", true, ist("2026-11-02T08:00:00"));
  await setMealSkip(sql, "tenant", "L1", "2026-11-02", "DINNER", true, ist("2026-11-02T08:00:00"));
  await setMealSkip(sql, "tenant", "L1", "2026-11-02", "DINNER", false, ist("2026-11-02T09:00:00"));
  const h = await ownerHeadcount(sql, "owner", "L1", "2026-11-02");
  assert.deepEqual({ r: h.residents, l: h.LUNCH, d: h.DINNER }, { r: 2, l: 1, d: 2 });
  assert.equal(h.skipping[0].name, "Asha Tenant");
  await assert.rejects(ownerHeadcount(sql, "tenant", "L1", "2026-11-02"));
});

test("notices: owner posts → resident sees, marks read → owner sees read count", async () => {
  const { pg, sql } = await setup();
  await assert.rejects(postNotice(sql, "tenant", "L1", "x", "", false));
  const id = await postNotice(sql, "owner", "L1", "Water off Sunday 10-12", "Tank cleaning", true);
  assert.equal((await pg.query(`select 1 from notifications where kind = 'notice' and user_id = 'tenant'`)).rows.length, 1);
  let t = await noticesFor(sql, "tenant");
  assert.deepEqual(t.resident.map((n) => [n.title, n.read, n.pinned]), [["Water off Sunday 10-12", false, true]]);
  await assert.rejects(markNoticeRead(sql, "stranger", id));
  await markNoticeRead(sql, "tenant", id);
  await markNoticeRead(sql, "tenant", id);
  t = await noticesFor(sql, "tenant");
  assert.equal(t.resident[0].read, true);
  assert.match(t.resident[0].createdAt, /^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} [AP]M IST$/);
  assert.equal((await noticesFor(sql, "owner")).posted[0].reads, 1);
  assert.equal((await noticesFor(sql, "stranger")).resident.length, 0);
  await deleteNotice(sql, "owner", id);
  assert.equal((await noticesFor(sql, "tenant")).resident.length, 0);
});
