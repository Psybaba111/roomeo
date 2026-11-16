// Roomie quiz on a throwaway PGlite DB with every migration applied. ZZ TEST / @example.com only.
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { testDb, seedListing, migrationsDir } from "./pgtest.ts";
import { ROOMIE_QUESTIONS, type RoomieAnswers, type RoomieTypeKey } from "./roomie-quiz.ts";
import { deleteRoomie, roomieTablesReady, occupantTypeCounts, readMyRoomie, recordStaySignals, ROOMIE_TABLE_MISSING, saveRoomie, typesForUsers, vibeMatchFor } from "./roomie-quiz-db.ts";

function leanTo(type: RoomieTypeKey): RoomieAnswers {
  const out: RoomieAnswers = {};
  for (const q of ROOMIE_QUESTIONS) out[q.id] = [...q.options].sort((a, b) => (b.points[type] ?? 0) - (a.points[type] ?? 0))[0].id;
  return out;
}

async function users(pg: PGlite, ids: string[]) {
  for (const id of ids)
    await pg.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, false) on conflict do nothing`, [id, `ZZ TEST ${id}`, `zz.test.${id.toLowerCase()}@example.com`]);
}

test("save needs consent and a full answer set; type is computed server-side", async () => {
  const { pg, sql } = await testDb();
  await users(pg, ["t1"]);
  assert.equal(await roomieTablesReady(sql), true);
  await assert.rejects(saveRoomie(sql, "t1", leanTo("solo"), false), /consent/);
  await assert.rejects(saveRoomie(sql, "t1", { sleep: "early" }, true), /Answer all/);
  assert.equal(await readMyRoomie(sql, "t1"), null);
  // A client-sent "type" is ignored.
  assert.equal(await saveRoomie(sql, "t1", { ...leanTo("solo"), type: "hype" }, true), "solo");
  const mine = await readMyRoomie(sql, "t1");
  assert.equal(mine?.type, "solo");
  assert.equal(Object.keys(mine?.answers ?? {}).length, ROOMIE_QUESTIONS.length);
  assert.ok(!("type" in (mine?.answers ?? {})));
  // Retake overwrites.
  assert.equal(await saveRoomie(sql, "t1", leanTo("tidy"), true), "tidy");
  assert.equal((await readMyRoomie(sql, "t1"))?.type, "tidy");
  const [{ n }] = (await pg.query<{ n: number }>(`select count(*)::int n from roomie_profiles`)).rows;
  assert.equal(n, 1);
});

test("delete removes answers and type; deleting the account cascades", async () => {
  const { pg, sql } = await testDb();
  await users(pg, ["t1", "t2"]);
  await saveRoomie(sql, "t1", leanTo("hype"), true);
  await saveRoomie(sql, "t2", leanTo("chill"), true);
  assert.equal(await deleteRoomie(sql, "t1"), true);
  assert.equal(await deleteRoomie(sql, "t1"), false);
  assert.equal(await readMyRoomie(sql, "t1"), null);
  assert.equal((await readMyRoomie(sql, "t2"))?.type, "chill");
  await pg.query(`delete from "user" where id = 't2'`);
  assert.equal(await readMyRoomie(sql, "t2"), null);
});

test("hosts get type keys only, never answers", async () => {
  const { pg, sql } = await testDb();
  await users(pg, ["t1", "t2", "t3"]);
  await saveRoomie(sql, "t1", leanTo("moonlighter"), true);
  await saveRoomie(sql, "t2", leanTo("sunrise"), true);
  const m = await typesForUsers(sql, ["t1", "t2", "t3", "t1", ""]);
  assert.deepEqual([...m.entries()].sort(), [["t1", "moonlighter"], ["t2", "sunrise"]]);
  for (const v of m.values()) assert.equal(typeof v, "string");
  assert.equal((await typesForUsers(sql, [])).size, 0);
});

test("listing occupants: current tenants only, aggregated with no ids", async () => {
  const { pg, sql } = await testDb();
  await seedListing(pg, "L1", "owner");
  await users(pg, ["a", "b", "c", "d", "e", "gone", "other"]);
  for (const [u, t] of [["a", "moonlighter"], ["b", "moonlighter"], ["c", "sunrise"], ["d", "chill"], ["e", "hype"], ["gone", "solo"], ["other", "tidy"]] as const)
    await saveRoomie(sql, u, leanTo(t), true);
  // a: bed board OCCUPIED; b: bed ON_NOTICE; c: confirmed 1:1 move-in; d+e: confirmed squad move-in.
  await pg.query(`insert into pg_beds (id, listing_id, owner_id, label, status, tenant_id) values
    ('B1','L1','owner','A1','OCCUPIED','a'), ('B2','L1','owner','A2','ON_NOTICE','b'), ('B3','L1','owner','A3','VACANT',null)`);
  await pg.query(`insert into move_ins (id, listing_id, seeker_id, owner_id, confirmed_at) values ('M1','L1','c','owner',now()),
    ('M2','L1','gone','owner',now()), ('M3','L1','other','owner',null)`);
  // "gone" moved out (vacate recorded) → not counted. "other" never confirmed → not counted.
  await pg.query(`insert into deal_agreements (id, application_id, listing_id, seeker_id, owner_id, terms_json, body, vacated_on)
    values ('D1','AP-gone','L1','gone','owner','{}','x','2026-11-10')`);
  await pg.query(`insert into squad_move_ins (id, squad_request_id, squad_id, listing_id, owner_id, confirmed_at) values ('S1','SR1','SQ1','L1','owner',now())`);
  await pg.query(`insert into squad_move_in_confirms (squad_move_in_id, user_id) values ('S1','d'), ('S1','e')`);
  const counts = await occupantTypeCounts(sql, "L1");
  assert.deepEqual(counts, { moonlighter: 2, sunrise: 1, chill: 1, hype: 1 });
  assert.deepEqual(await occupantTypeCounts(sql, "nope"), {});
});

test("a DB without migration 0028 degrades quietly (no types) and refuses to save", async () => {
  const pg = new PGlite();
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql") && n < "0028").sort()) await pg.exec(readFileSync(new URL(f, migrationsDir), "utf8"));
  const sql = { query: async (t: string, p?: unknown[]) => (await pg.query(t, p)).rows } as never;
  assert.equal(await roomieTablesReady(sql), false);
  assert.equal(await readMyRoomie(sql, "x"), null);
  assert.equal((await typesForUsers(sql, ["x"])).size, 0);
  assert.deepEqual(await occupantTypeCounts(sql, "L1"), {});
  assert.equal(await deleteRoomie(sql, "x"), false);
  await assert.rejects(saveRoomie(sql, "x", leanTo("chill"), true), new RegExp(ROOMIE_TABLE_MISSING.slice(0, 20)));
});

test("vibe match: seeker vs current occupants, seeker excluded; null without quiz or occupants", async () => {
  const { pg, sql } = await testDb();
  await seedListing(pg, "L1", "owner");
  await users(pg, ["seek", "a", "b", "noquiz"]);
  await saveRoomie(sql, "seek", leanTo("tidy"), true);
  assert.equal(await vibeMatchFor(sql, "L1", "seek"), null); // empty room
  await saveRoomie(sql, "a", leanTo("tidy"), true);
  await pg.query(`insert into pg_beds (id, listing_id, owner_id, label, status, tenant_id) values ('B1','L1','owner','A1','OCCUPIED','a'), ('B2','L1','owner','A2','OCCUPIED','seek')`);
  const m = await vibeMatchFor(sql, "L1", "seek");
  assert.equal(m?.score, 100);
  assert.equal(m?.pairs, 1); // the seeker isn't matched with themself
  assert.equal(await vibeMatchFor(sql, "L1", "noquiz"), null);
  await saveRoomie(sql, "b", leanTo("hype"), true);
  await pg.query(`insert into pg_beds (id, listing_id, owner_id, label, status, tenant_id) values ('B3','L1','owner','A3','OCCUPIED','b')`);
  const m2 = await vibeMatchFor(sql, "L1", "seek");
  assert.equal(m2?.pairs, 2);
  assert.ok(m2!.score < 100);
});

test("STAY_60 signals: logged once for 60+ day stays, removed when the user deletes their quiz", async () => {
  const { pg, sql } = await testDb();
  await seedListing(pg, "L1", "owner");
  await users(pg, ["old", "new", "anon"]);
  await saveRoomie(sql, "old", leanTo("solo"), true);
  await saveRoomie(sql, "new", leanTo("solo"), true);
  await pg.query(`insert into pg_beds (id, listing_id, owner_id, label, status, tenant_id, move_in_date) values
    ('B1','L1','owner','A1','OCCUPIED','old','2026-08-01'), ('B2','L1','owner','A2','OCCUPIED','new','2026-11-01'), ('B3','L1','owner','A3','OCCUPIED','anon','2026-01-01')`);
  const now = new Date("2026-11-16T07:00:00Z");
  assert.equal(await recordStaySignals(sql, "L1", undefined, now), 1);
  assert.equal(await recordStaySignals(sql, "L1", undefined, now), 0);
  const rows = (await pg.query<Record<string, unknown>>(`select tenant_id, tenant_type, score, occupants_n, config_version from roomie_match_signals`)).rows;
  assert.deepEqual(rows, [{ tenant_id: "old", tenant_type: "solo", score: 100, occupants_n: 1, config_version: 1 }]);
  await deleteRoomie(sql, "old");
  assert.equal((await pg.query(`select 1 from roomie_match_signals`)).rows.length, 0);
});
