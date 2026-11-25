// Booking funnel: event log, admin counts, owner nudge, /list-your-bed intake (25 Nov 2026). PGlite, ZZ TEST data only.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb, seedListing, migrationsDir } from "./pgtest.ts";
import { funnelCounts, funnelTables, handoffEventsFor, recordFunnelEvent, recordPaymentCompleted, runOwnerNudges, nudgeCounts } from "./funnel-db.ts";
import { nudgeBedLabel, nudgeHoldReason, stepRate } from "./funnel-steps.ts";
import { AREA_PINCODES, intakeListingInput, intakePincode, intakeStatus, istToday, parseIntake } from "./intake.ts";
import { BENGALURU_LAUNCH_AREAS } from "./cities.ts";
import { withTransaction } from "../tx.ts";
import type { Sql } from "../db.ts";

const n = async (pg: { query: (q: string) => Promise<{ rows: Array<{ n: number }> }> }, q: string) => Number((await pg.query(q)).rows[0].n);

async function withRequest(ageHours: number, id = "A1") {
  const db = await testDb();
  await seedListing(db.pg, "L1", "owner");
  await db.pg.query(`insert into applications (id, listing_id, seeker_id, host_id, note, created_at) values ($1, 'L1', 'tenant', 'owner', 'ZZ TEST', now() - ($2 || ' hours')::interval)`, [id, String(ageHours)]);
  return db;
}

const ON = { MAPPSTORE_NOTIFY_ENABLED: "true", MAPPSTORE_API_KEY: "zz-test-key", MAPPSTORE_TPL_OWNER_NUDGE: "roomeo_owner_nudge" };

describe("migration 0034 (preview only until approved)", () => {
  test("creates the log + nudge tables and the three Bengaluru areas; safe to re-run", async () => {
    const { pg, sql } = await testDb();
    await pg.exec(readFileSync(new URL("0034_funnel_nudges.sql", migrationsDir), "utf8")); // second run
    assert.deepEqual(await funnelTables(sql), { events: true, nudges: true });
    const areas = (await pg.query<{ name: string }>(`select l.name from localities l join cities c on c.id = l.city_id where c.name = 'Bengaluru'`)).rows.map((r) => r.name);
    for (const a of ["BTM Layout", "Marathahalli", "Manyata Tech Park"]) assert.equal(areas.filter((x) => x === a).length, 1, a);
    for (const a of BENGALURU_LAUNCH_AREAS) assert.ok(areas.includes(a), a);
  });
});

describe("funnel event log", () => {
  test("one row per kind + ref; repeats are duplicates; city comes from the listing", async () => {
    const { pg, sql } = await testDb();
    await seedListing(pg, "L1", "owner");
    assert.equal(await recordFunnelEvent(sql, { kind: "request_submitted", refId: "A1", listingId: "L1", userId: "tenant" }), "saved");
    assert.equal(await recordFunnelEvent(sql, { kind: "request_submitted", refId: "A1", listingId: "L1", userId: "tenant" }), "duplicate");
    assert.equal(await recordFunnelEvent(sql, { kind: "owner_responded", refId: "A1", listingId: "L1" }), "saved");
    const rows = (await pg.query<{ kind: string; city: string }>(`select kind, city from funnel_events order by kind`)).rows;
    assert.deepEqual(rows, [{ kind: "owner_responded", city: "Mangaluru" }, { kind: "request_submitted", city: "Mangaluru" }]);
    assert.equal(await recordFunnelEvent(sql, { kind: "bogus" as never, refId: "x" }), "failed");
  });

  test("without migration 0034 (prod today) logging is a quiet no-op, also inside a transaction", async () => {
    const { pg, sql } = await testDb();
    await seedListing(pg, "L1", "owner");
    await pg.exec("drop table owner_nudges; drop table funnel_events;");
    assert.deepEqual(await funnelTables(sql), { events: false, nudges: false });
    assert.equal(await recordFunnelEvent(sql, { kind: "moved_in", refId: "M1", listingId: "L1" }), "no_table");
    await withTransaction(sql as Sql, async (tx) => {
      await tx.query(`update listings set title = 'ZZ TEST kept' where id = 'L1'`, []);
      assert.equal(await recordFunnelEvent(tx, { kind: "moved_in", refId: "M1", listingId: "L1" }), "no_table");
    });
    assert.equal(await n(pg, `select count(*)::int n from listings where title = 'ZZ TEST kept'`), 1, "the caller's transaction committed");
    assert.deepEqual(await handoffEventsFor(sql, "tenant"), []);
    const r = await runOwnerNudges(sql, { env: ON, send: async () => { throw new Error("must not send"); } });
    assert.equal(r.ready, false);
    const f = await funnelCounts(sql, 7);
    assert.ok(f.steps.every((s) => s.logged === null), "no log column without the table");
    assert.equal(await nudgeCounts(sql, 7), null);
  });

  test("payment_completed only for contact / success fee payments that are PAID", async () => {
    const { pg, sql } = await testDb();
    await seedListing(pg, "L1", "owner");
    await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id) values
      ('P1','tenant','ZZ TEST fee',499,'PAID','UPI','RMZZF1','SUCCESS_FEE','L1'), ('P2','tenant','ZZ TEST boost',99,'PAID','UPI','RMZZF2','BOOST','L1'),
      ('P3','tenant','ZZ TEST fee',499,'SUBMITTED','UPI','RMZZF3','SUCCESS_FEE','L1')`);
    assert.equal(await recordPaymentCompleted(sql, "P1"), "saved");
    assert.equal(await recordPaymentCompleted(sql, "P1"), "duplicate");
    assert.equal(await recordPaymentCompleted(sql, "P2"), "failed");
    assert.equal(await recordPaymentCompleted(sql, "P3"), "failed");
    const h = await handoffEventsFor(sql, "tenant");
    assert.deepEqual(h.map((e) => [e.kind, e.listingId, e.city]), [["payment_completed", "L1", "Mangaluru"]]);
  });
});

describe("admin funnel counts (DB state)", () => {
  test("counts each step for 7 / 30 days, leaves demo beds out, and shows the log beside it", async () => {
    const { pg, sql } = await testDb();
    await seedListing(pg, "L1", "owner");
    await pg.query(`insert into metric_events (id, kind, city) values ('s1','search','Bengaluru'), ('s2','search',''), ('s3','search','x')`);
    await pg.query(`update metric_events set created_at = now() - interval '20 days' where id = 's3'`);
    await pg.query(`insert into applications (id, listing_id, seeker_id, host_id, status) values ('A1','L1','tenant','owner','PENDING'), ('A2','L1','tenant','owner','ACCEPTED'), ('A3','L1','tenant','owner','DECLINED')`);
    await pg.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id) values ('P1','tenant','ZZ TEST',499,'PAID','UPI','RMZZC1','SUCCESS_FEE','L1')`);
    await pg.query(`insert into move_ins (id, application_id, listing_id, seeker_id, owner_id, confirmed_at) values ('M1','A2','L1','tenant','owner',now())`);
    await recordFunnelEvent(sql, { kind: "request_submitted", refId: "A1", listingId: "L1" });
    // a demo bed's request is never counted
    await seedListing(pg, "LD", "owner");
    await pg.query(`update listings set is_demo = true where id = 'LD'`);
    await pg.query(`insert into applications (id, listing_id, seeker_id, host_id) values ('AD','LD','tenant','owner')`);
    const w7 = await funnelCounts(sql, 7);
    const by = Object.fromEntries(w7.steps.map((s) => [s.key, s]));
    assert.deepEqual(w7.steps.map((s) => s.key), ["search", "listing_view", "request_submitted", "owner_responded", "request_accepted", "payment_completed", "moved_in", "whatsapp_click"]);
    assert.equal(by.search.count, 2);
    assert.equal(by.listing_view.count, null, "GA4 only");
    assert.equal(by.whatsapp_click.count, null, "GA4 only");
    assert.equal(by.request_submitted.count, 3);
    assert.equal(by.owner_responded.count, 2);
    assert.equal(by.request_accepted.count, 1);
    assert.equal(by.payment_completed.count, 1);
    assert.equal(by.moved_in.count, 1);
    assert.equal(by.request_submitted.logged, 1);
    assert.equal(by.search.logged, null);
    assert.equal(Object.fromEntries((await funnelCounts(sql, 30)).steps.map((s) => [s.key, s.count])).search, 3);
    assert.equal(stepRate(10, 3), "30%");
    assert.equal(stepRate(0, 3), "");
    assert.equal(stepRate(null, 3), "");
  });
});

describe("owner nudge (at most one per request, nothing sent while the flag is off)", () => {
  test("flag off: a 3 hour old pending request is logged HELD once; nothing is sent", async () => {
    const { pg, sql } = await withRequest(3);
    let sends = 0;
    const send = async () => { sends++; return "sent" as const; };
    const r1 = await runOwnerNudges(sql, { env: {}, send });
    const r2 = await runOwnerNudges(sql, { env: { MAPPSTORE_NOTIFY_ENABLED: "false" }, send });
    assert.equal(sends, 0);
    assert.deepEqual([r1.ready, r1.enabled, r1.due, r1.held], [true, false, 1, 1]);
    assert.equal(r2.held, 1, "still held (same row)");
    assert.equal(await n(pg, `select count(*)::int n from owner_nudges where application_id = 'A1' and status = 'HELD' and reason like 'MAPPSTORE_NOTIFY_ENABLED%'`), 1);
    assert.equal(await n(pg, `select count(*)::int n from owner_nudges`), 1);
    assert.deepEqual(await nudgeCounts(sql, 7), { HELD: 1, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 });
  });

  test("flag on + template + verified phone: sent exactly once, even across repeated passes", async () => {
    const { pg, sql } = await withRequest(3);
    await pg.query(`update profiles set phone_e164 = '+919876500001', phone_verified_at = now() where user_id = 'owner'`);
    await runOwnerNudges(sql, { env: {}, send: async () => "sent" }); // held first while off
    const calls: Array<[string, string[]]> = [];
    const send = async (phone: string, params: string[]) => { calls.push([phone, params]); return "sent" as const; };
    const r = await runOwnerNudges(sql, { env: ON, send });
    await runOwnerNudges(sql, { env: ON, send });
    await Promise.all([runOwnerNudges(sql, { env: ON, send }), runOwnerNudges(sql, { env: ON, send })]);
    assert.equal(r.sent, 1);
    assert.deepEqual(calls, [["+919876500001", ["Mud Home 2-sharing"]]]);
    assert.equal(await n(pg, `select count(*)::int n from owner_nudges where status = 'SENT' and sent_at is not null`), 1);
  });

  test("no verified owner phone: held; a failed send is final (never retried)", async () => {
    const { pg, sql } = await withRequest(5);
    assert.equal((await runOwnerNudges(sql, { env: ON, send: async () => "sent" })).held, 1);
    assert.equal(await n(pg, `select count(*)::int n from owner_nudges where reason = 'owner has no verified phone'`), 1);
    await pg.query(`update profiles set phone_e164 = '+919876500002', phone_verified_at = now() where user_id = 'owner'`);
    let sends = 0;
    const failing = async () => { sends++; return "failed" as const; };
    assert.equal((await runOwnerNudges(sql, { env: ON, send: failing })).failed, 1);
    await runOwnerNudges(sql, { env: ON, send: failing });
    assert.equal(sends, 1);
    assert.equal(await n(pg, `select count(*)::int n from owner_nudges where status = 'FAILED'`), 1);
  });

  test("too new (under 2 h), too old (over 72 h), answered, or a demo bed: no nudge", async () => {
    for (const [age, status, demo] of [[1, "PENDING", false], [80, "PENDING", false], [3, "ACCEPTED", false], [3, "PENDING", true]] as const) {
      const { pg, sql } = await withRequest(age);
      await pg.query(`update applications set status = $1`, [status]);
      if (demo) await pg.query(`update listings set is_demo = true`);
      const r = await runOwnerNudges(sql, { env: ON, send: async () => "sent" });
      assert.equal(r.due, 0, `${age}h ${status} demo=${demo}`);
    }
  });

  test("hold reasons and the bed label", () => {
    assert.equal(nudgeHoldReason({ flagOn: false, templateSet: true, apiKeySet: true, ownerPhone: "+91" }), "MAPPSTORE_NOTIFY_ENABLED is off");
    assert.equal(nudgeHoldReason({ flagOn: true, templateSet: false, apiKeySet: true, ownerPhone: "+91" }), "MAPPSTORE_TPL_OWNER_NUDGE not set");
    assert.equal(nudgeHoldReason({ flagOn: true, templateSet: true, apiKeySet: true, ownerPhone: "+91" }), "");
    assert.equal(nudgeBedLabel("Mud Home Premium PG · 6-sharing AC bed for working men · MPT Road, Bunder"), "6-sharing AC bed for working men");
    assert.equal(nudgeBedLabel(""), "your bed");
  });
});

describe("/list-your-bed intake", () => {
  const photo = { url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ", category: "Bedroom" };
  test("validates phone, area, price, deposit and photos with plain errors", () => {
    const ok = parseIntake({ phone: "098765 43210", area: "BTM Layout", monthlyRent: 7999, deposit: 7999, photos: [photo], ownerDeclared: true });
    assert.deepEqual([ok.phoneE164, ok.city, ok.pincode, ok.propertyType], ["+919876543210", "Bengaluru", "560076", "PG"]);
    assert.throws(() => parseIntake({ phone: "12345", area: "BTM Layout", monthlyRent: 7999, photos: [photo] }), /10 digit/);
    assert.throws(() => parseIntake({ phone: "9876543210", area: "", monthlyRent: 7999, photos: [photo] }), /area/);
    assert.throws(() => parseIntake({ phone: "9876543210", area: "Indiranagar", monthlyRent: 7999, photos: [photo] }), /Pincode/);
    assert.throws(() => parseIntake({ phone: "9876543210", area: "BTM Layout", monthlyRent: 900, photos: [photo] }), /Price per bed/);
    assert.throws(() => parseIntake({ phone: "9876543210", area: "BTM Layout", monthlyRent: 7999, deposit: 999999, photos: [photo] }), /Deposit/);
    assert.throws(() => parseIntake({ phone: "9876543210", area: "BTM Layout", monthlyRent: 7999, photos: [] }), /photo/);
    assert.equal(intakePincode("Indiranagar", "560038"), "560038");
    for (const a of BENGALURU_LAUNCH_AREAS) assert.match(AREA_PINCODES[a], /^56\d{4}$/, a);
  });
  test("becomes a normal BED listing input (same write path as /create-listing)", () => {
    const i = parseIntake({ phone: "9876543210", area: "Manyata Tech Park", propertyType: "Apartment", monthlyRent: 9500, deposit: 19000, photos: [photo], ownerDeclared: true });
    const d = intakeListingInput(i, "2026-11-25");
    assert.equal(d.title, "Shared room in Manyata Tech Park, Bengaluru");
    assert.deepEqual([d.listingKind, d.roomType, d.locality, d.pincode, d.monthlyRent, d.deposit, d.availableFrom], ["BED", "Shared room", "Manyata Tech Park", "560045", 9500, 19000, "2026-11-25"]);
    assert.match(istToday(new Date("2026-11-24T20:00:00Z")), /^2026-11-25$/);
  });
  test("host status says 'Under ID review' until the ID is VERIFIED", () => {
    assert.equal(intakeStatus({ identityStatus: "UNVERIFIED", reviewStatus: "PENDING", phoneVerified: false }).label, "Under ID review");
    assert.match(intakeStatus({ identityStatus: "UNVERIFIED", reviewStatus: "", phoneVerified: false }).label, /^Under ID review/);
    assert.equal(intakeStatus({ identityStatus: "VERIFIED", reviewStatus: "APPROVED", phoneVerified: true }).key, "live");
    assert.equal(intakeStatus({ identityStatus: "UNVERIFIED", reviewStatus: "REJECTED", phoneVerified: false }).key, "id_rejected");
  });
  test("visibility stays the existing rule: every public read requires the host's ID VERIFIED", () => {
    const pub = readFileSync(new URL("./public-api.ts", import.meta.url), "utf8");
    const acct = readFileSync(new URL("./account-api.ts", import.meta.url), "utf8");
    assert.ok(pub.includes(`"(l.is_demo = true or pr.identity_status = 'VERIFIED')"`), "search");
    assert.ok(pub.includes(`const visible = bool(row.is_demo) || bool(row.host_demo) || str(row.host_identity) === "VERIFIED";`), "listing page");
    assert.ok(pub.includes("and pr.identity_status = 'VERIFIED' and lower(l.city_name) = lower($1)"), "home live count");
    const intake = acct.slice(acct.indexOf("export const submitBedIntake"), acct.indexOf("export const myBedIntakes"));
    assert.ok(!/identity_status\s*=/.test(intake), "the intake never touches identity_status");
    assert.ok(!/verification_status\s*=/.test(intake), "or the verification status");
  });
});
