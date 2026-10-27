// Migration 0006 against in-memory PGlite: rate-limit SQL, unique trust checks, verified-phone uniqueness.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { hitLimit, LIMITS, RateLimitError } from "./rate-limit.ts";

const dir = new URL("../../../migrations/", import.meta.url);
async function db() {
  const pg = new PGlite();
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) await pg.exec(readFileSync(new URL(f, dir), "utf8"));
  return pg;
}
// Minimal Sql adapter over PGlite for the helper under test.
function sqlOf(pg: PGlite) {
  const fn = (async () => {
    throw new Error("tagged form unused");
  }) as unknown as import("../db.ts").Sql;
  fn.query = async (text: string, params?: unknown[]) => (await pg.query(text, params)).rows as never;
  return fn;
}

test("postgres rate limit allows up to the cap per bucket and user", async () => {
  const pg = await db();
  const sql = sqlOf(pg);
  for (let i = 0; i < LIMITS.report.max; i++) await hitLimit(sql, "u1", "report");
  await assert.rejects(hitLimit(sql, "u1", "report"), RateLimitError);
  await hitLimit(sql, "u2", "report");
  await hitLimit(sql, "u1", "apply");
  await pg.close();
});

test("trust checks are unique per (user_id, kind) and upsert never downgrades VERIFIED", async () => {
  const pg = await db();
  const up = (id: string, status: string) =>
    pg.query(
      `insert into trust_checks (id, user_id, kind, status, note) values ($1,'u1','PHONE',$2,'')
       on conflict (user_id, kind) do update set status = excluded.status, updated_at = now()
       where trust_checks.status <> 'VERIFIED' or excluded.status = 'VERIFIED'`,
      [id, status],
    );
  await up("a", "PENDING");
  await up("b", "VERIFIED");
  await up("c", "REJECTED");
  const rows = (await pg.query<{ status: string }>(`select status from trust_checks where user_id='u1'`)).rows;
  assert.deepEqual(rows, [{ status: "VERIFIED" }]);
  await pg.close();
});

test("a verified phone belongs to one account", async () => {
  const pg = await db();
  await pg.query(`insert into profiles (user_id, full_name, phone_e164, phone_verified_at) values ('u1','A','+919876543210', now()), ('u2','B','+919876543210', null)`);
  await assert.rejects(pg.query(`update profiles set phone_verified_at = now() where user_id='u2'`), /profiles_verified_phone_key/);
  await pg.close();
});
