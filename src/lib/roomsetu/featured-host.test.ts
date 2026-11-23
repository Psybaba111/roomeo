// Home "real beds" strip: only Mud Home's own live beds; the duplicate 47d697f8 never shows. Throwaway PGlite.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb, seedListing } from "./pgtest.ts";
import { FEATURED_SQL_WHERE, featuredParams, MUD_HOME_OWNER_ID, shortBedTitle } from "./featured-host.ts";

test("only the Mud Home account's active, non-demo, verified beds; never 47d697f8", async () => {
  const { pg } = await testDb();
  await seedListing(pg, "mud-6", MUD_HOME_OWNER_ID);
  await seedListing(pg, "mud-4", MUD_HOME_OWNER_ID);
  await seedListing(pg, "mud-old", MUD_HOME_OWNER_ID);
  await seedListing(pg, "47d697f8-dupe", MUD_HOME_OWNER_ID); // even if it were Mud Home's, it is excluded
  await seedListing(pg, "other-1", "someone-else");
  await pg.query(`update profiles set identity_status = 'VERIFIED'`);
  await pg.query(`update listings set status = 'REMOVED' where id = 'mud-old'`);
  await pg.query(`update listings set monthly_rent = 5999 where id = 'mud-6'`);
  const rows = (await pg.query<{ id: string }>(
    `select l.id from listings l join profiles pr on pr.user_id = l.owner_id where ${FEATURED_SQL_WHERE} order by l.monthly_rent`,
    featuredParams(),
  )).rows;
  assert.deepEqual(rows.map((r) => r.id), ["mud-6", "mud-4"]);
  await pg.query(`update profiles set identity_status = 'UNVERIFIED' where user_id = $1`, [MUD_HOME_OWNER_ID]);
  assert.equal((await pg.query(`select 1 from listings l join profiles pr on pr.user_id = l.owner_id where ${FEATURED_SQL_WHERE}`, featuredParams())).rows.length, 0);
  await pg.close();
});

test("short card title from the Mud Home naming", () => {
  assert.equal(shortBedTitle("Mud Home Premium PG · 6-sharing AC bed for working men · MPT Road, Bunder"), "6-sharing AC bed for working men");
  assert.equal(shortBedTitle("Plain title"), "Plain title");
});

test("home renders the strip above the hero/quiz, and no city we have no beds in is claimed", () => {
  const home = readFileSync(new URL("../../routes/index.tsx", import.meta.url), "utf8");
  const strip = home.indexOf("<MudHomeBeds");
  const hero = home.indexOf("{hero ? hero(city)");
  assert.ok(strip > 0 && hero > 0 && strip < hero, "strip before hero");
  const seo = readFileSync(new URL("../seo.ts", import.meta.url), "utf8");
  const site = readFileSync(new URL("../og/site.json", import.meta.url), "utf8");
  for (const s of [seo, site]) assert.doesNotMatch(s, /Bengaluru/);
  assert.doesNotMatch(readFileSync(new URL("../../components/auth-panel.tsx", import.meta.url), "utf8"), /Bengaluru and Mangaluru beds/);
});
