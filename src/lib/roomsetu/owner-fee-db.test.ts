// End-to-end owner-fee workflow on a throwaway PGlite database with every migration (incl. 0027) applied.
// Search → request (first enquiry) → owner accepts → agreement signed by both → address unlocks →
// move-in confirmed → commission created (20%, or 15% for a founding host), due 7 days later → paid → 50% refund.
// ZZ TEST accounts only (@example.com). Nothing here touches a real database or Razorpay.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { testDb } from "./pgtest.ts";
import { confirmMoveInRecord } from "./movein-confirm.ts";
import { signAgreement } from "./agreement-db.ts";
import { agreementBody, agreementFeeBaseInr } from "./deal-agreement.ts";
import { locationAccess, locationUnlocked } from "./location-gate.ts";
import { pricingConfig } from "./pricing.ts";
import { feeViewOf, feeUnderPrice, feeLine, mentionsFeeAmount } from "./fee-copy.ts";
import { istYmd, addDays } from "./owner-fee.ts";
import {
  allCommissions,
  createCommissionForMoveIn,
  firstEnquiryAt,
  hostRateNow,
  markCommissionPaid,
  ownerCommissions,
  recordCommissionRefund,
  recordEarlyExit,
  setFoundingPartner,
  hostFoundingNow,
  waivedRowsSupported,
  createCommissionsForSquadMoveIn,
  commissionsOnSquadMoveIn,
  withCommissionTables,
  markDepositReceived,
  undoDepositMark,
  COMMISSION_TABLES_MISSING,
  isMissingCommissionTable,
} from "./owner-fee-db.ts";

const MODEL = { ROOMEO_TENANT_FEE_ENABLED: "false", OWNER_FEE_ENABLED: "true" };
async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const keys = ["ROOMEO_FEE_ENABLED", "ROOMEO_TENANT_FEE_ENABLED", "OWNER_FEE_ENABLED", "OWNER_FEE_GST_ENABLED"];
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

async function person(pg: PGlite, id: string, name: string, intent = "LOOKING") {
  await pg.query(`insert into "user" (id, name, email, "emailVerified") values ($1,$2,$3,true) on conflict do nothing`, [id, name, `${id}@example.com`]);
  await pg.query(`insert into profiles (user_id, full_name, intent) values ($1,$2,$3) on conflict do nothing`, [id, name, intent]);
}

async function listing(pg: PGlite, id: string, owner: string, rent: number) {
  const city = (await pg.query<{ id: string }>(`select id from cities limit 1`)).rows[0]?.id;
  await pg.query(`insert into properties (id, owner_id, title, property_type, address, city_id, pincode, lat, lng) values ($1,$2,'ZZ TEST Mud Home','PG','62 MPT Road, Bunder',$3,'575001',12.86,74.84) on conflict do nothing`, [`P-${id}`, owner, city]);
  await pg.query(`insert into listings (id, property_id, owner_id, title, description, city_name, locality_name, monthly_rent, deposit, available_from, room_type, furnished)
    values ($1,$2,$3,$4,'ZZ TEST','Mangaluru','Bunder',$5,$5,'2026-11-01','Shared room','Furnished')`, [id, `P-${id}`, owner, `ZZ TEST bed ₹${rent}`, rent]);
}

/** Runs the whole tenant → owner flow and returns the commission (if any). `enquiryDaysAgo` back-dates the request. */
async function flow(pg: PGlite, sql: never, o: { owner: string; tenant: string; listingId: string; rent: number; enquiryDaysAgo: number }) {
  // 1. Tenant searches (same filter the public search uses: active beds in the city).
  const found = (await pg.query<{ id: string; monthly_rent: number }>(`select id, monthly_rent from listings where status = 'ACTIVE' and city_name = 'Mangaluru' and id = $1`, [o.listingId])).rows;
  assert.equal(found.length, 1, "tenant finds the bed in search");
  const tenantView = feeViewOf(pricingConfig());
  assert.equal(mentionsFeeAmount(feeUnderPrice(tenantView)), false, "listing shows no tenant fee");
  assert.match(feeUnderPrice(tenantView), /Free for tenants/);
  // 2. Tenant sends a request (first Roomeo enquiry to this host), back-dated.
  const app = `A-${o.tenant}-${o.listingId}`;
  await pg.query(`insert into applications (id, listing_id, seeker_id, host_id, status, created_at) values ($1,$2,$3,$4,'PENDING', now() - ($5 || ' days')::interval)`, [app, o.listingId, o.tenant, o.owner, String(o.enquiryDaysAgo)]);
  // 3. Owner accepts.
  await pg.query(`update applications set status = 'ACCEPTED', updated_at = now() where id = $1`, [app]);
  // 4. Agreement drafted and signed by both sides.
  const cfg = pricingConfig();
  const terms = { listingTitle: "ZZ TEST Mud Home", address: "62 MPT Road, Bunder", city: "Mangaluru", locality: "Bunder", monthlyRent: o.rent, deposit: o.rent, moveIn: "2026-11-20",
    tenantName: "ZZ TEST Tenant", ownerName: "ZZ TEST Owner", feeBaseInr: agreementFeeBaseInr(cfg), ownerFee: true };
  await hostRateNow(sql, o.owner);
  await pg.query(`insert into deal_agreements (id, application_id, listing_id, seeker_id, owner_id, terms_json, body) values ($1,$2,$3,$4,$5,$6,$7)`,
    [`DA-${app}`, app, o.listingId, o.tenant, o.owner, JSON.stringify(terms), agreementBody(terms)]);
  const locked = await locationAccess(sql, o.listingId, o.owner, o.tenant);
  assert.equal(locationUnlocked(locked), false, "address hidden before signing");
  await signAgreement(sql, { applicationId: app, userId: o.tenant, name: "ZZ TEST Tenant", ip: "127.0.0.1" });
  const issued = await signAgreement(sql, { applicationId: app, userId: o.owner, name: "ZZ TEST Owner", ip: "127.0.0.1" });
  assert.ok(issued?.issued_at, "agreement issued");
  // 5. Address unlocks (tenant fee off: no payment needed).
  assert.equal(locationUnlocked(await locationAccess(sql, o.listingId, o.owner, o.tenant)), true, "address unlocks after both sign");
  // 6. Move-in confirmed by both → commission hook runs.
  await confirmMoveInRecord(sql, { applicationId: app, listingId: o.listingId, seekerId: o.tenant, ownerId: o.owner, side: "seeker", notifyUserId: o.owner });
  const r = await confirmMoveInRecord(sql, { applicationId: app, listingId: o.listingId, seekerId: o.tenant, ownerId: o.owner, side: "owner", notifyUserId: o.tenant });
  assert.equal(r.confirmed, true);
  assert.equal((await allCommissions(sql)).filter((c) => c.tenantId === o.tenant && c.listingId === o.listingId).length, 0, "move-in alone never charges the owner");
  // 7. Owner marks "deposit + rent advance received" → the owner fee is created now (never earlier).
  const mark = await markDepositReceived(sql, { applicationId: app, actorId: o.owner, role: "owner" });
  const rows = (await allCommissions(sql)).filter((c) => c.tenantId === o.tenant && c.listingId === o.listingId && c.status !== "void");
  return { app, moveInId: r.moveInId, mark, commission: rows[0] ?? null, body: agreementBody(terms) };
}

describe("owner-fee workflow (PGlite, ZZ TEST data)", () => {
  test("GST off (default): flat ₹499 on move-in, due 7 days later, paid, then 50% refund ₹250", () => withEnv(MODEL, async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-owner-1", "ZZ TEST Owner", "LISTING");
    await person(pg, "zz-tenant-1", "ZZ TEST Tenant");
    await listing(pg, "ZZL1", "zz-owner-1", 5999);
    const { commission: c, body, app, moveInId } = await flow(pg, sql, { owner: "zz-owner-1", tenant: "zz-tenant-1", listingId: "ZZL1", rent: 5999, enquiryDaysAgo: 10 });
    assert.doesNotMatch(body, /₹(499|589)/);
    assert.doesNotMatch(body, /20%|commission/i, "tenant's copy of the agreement has no commission");
    assert.ok(c, "commission created");
    const today = istYmd(new Date());
    assert.equal(c.ratePct, 0, "flat row: no % rate");
    assert.equal(c.founding, false);
    assert.equal(c.rentInr, 5999);
    assert.equal(c.feeInr, 499);
    assert.equal(c.gstPct, 0);
    assert.equal(c.gstInr, 0);
    assert.equal(c.totalInr, 499);
    assert.equal(c.amountDueInr, 499);
    assert.equal((await pg.query<{ m: string; r: number | null }>(`select fee_model m, rate_pct r from owner_commissions where id = $1`, [c.id])).rows[0].m, "flat");
    assert.equal(c.squad, false);
    assert.equal(c.moveInOn, today);
    assert.equal(c.dueOn, addDays(today, 7));
    assert.equal(c.status, "due");
    assert.equal(c.attributionDays, 10);
    assert.equal(c.paymentLinkMode, "stub");
    assert.equal((await ownerCommissions(sql, "zz-owner-1")).length, 1);
    assert.equal((await ownerCommissions(sql, "zz-tenant-1")).length, 0, "tenant has nothing to pay");
    const note = (await pg.query(`select body from notifications where user_id = 'zz-owner-1' and title = 'Roomeo fee due'`)).rows;
    assert.equal(note.length, 1);
    assert.doesNotMatch(String((note[0] as { body: string }).body), /GST/);
    assert.equal(c.trigger, "deposit");
    assert.equal(c.moveInId, `deposit:${app}`);
    // Marking twice, or the legacy move-in path, never creates a second commission.
    assert.equal((await markDepositReceived(sql, { applicationId: app, actorId: "zz-owner-1", role: "owner" })).commission?.created ?? false, false);
    assert.equal((await createCommissionForMoveIn(sql, moveInId, { force: true })).created, false);
    assert.equal((await allCommissions(sql)).length, 1);
    // Refund before payment isn't allowed; mark paid; refund at day 16 refused; day 15 OK.
    await assert.rejects(recordCommissionRefund(sql, c.id, "zz-admin", { vacatedOn: addDays(today, 3), refundedOn: addDays(today, 4), ref: "x" }), /Only a paid commission/);
    const paid = await markCommissionPaid(sql, c.id, "zz-admin", today, "ZZTEST-PAY-1");
    assert.equal(paid.status, "paid");
    assert.equal(paid.paidInr, 499);
    await assert.rejects(recordEarlyExit(sql, c.id, "zz-admin", addDays(today, 3)), /only be recorded on an unpaid commission/);
    await assert.rejects(markCommissionPaid(sql, c.id, "zz-admin", today, "again"), /Only a due commission/);
    await assert.rejects(recordCommissionRefund(sql, c.id, "zz-admin", { vacatedOn: addDays(today, 16), refundedOn: addDays(today, 17), ref: "x" }), /more than 15 days/);
    const ref = await recordCommissionRefund(sql, c.id, "zz-admin", { vacatedOn: addDays(today, 15), refundedOn: addDays(today, 16), ref: "ZZTEST-REF-1" });
    assert.equal(ref.status, "refunded_50");
    assert.equal(ref.refundInr, 250);
  }));

  test("GST on: ₹499 all-in = ₹423 + ₹76 GST; refund is 50% of both = ₹250", () => withEnv({ ...MODEL, OWNER_FEE_GST_ENABLED: "true" }, async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-owner-g", "ZZ TEST Owner GST", "LISTING");
    await person(pg, "zz-tenant-g", "ZZ TEST Tenant GST");
    await listing(pg, "ZZLG", "zz-owner-g", 5999);
    const { commission: c } = await flow(pg, sql, { owner: "zz-owner-g", tenant: "zz-tenant-g", listingId: "ZZLG", rent: 5999, enquiryDaysAgo: 4 });
    assert.ok(c);
    assert.equal(c.gstPct, 18);
    assert.equal(c.feeInr, 423);
    assert.equal(c.gstInr, 76);
    assert.equal(c.totalInr, 499);
    assert.equal(c.amountDueInr, 499);
    const today = istYmd(new Date());
    await markCommissionPaid(sql, c.id, "zz-admin", today, "ZZTEST-PAY-G");
    const ref = await recordCommissionRefund(sql, c.id, "zz-admin", { vacatedOn: addDays(today, 5), refundedOn: addDays(today, 6), ref: "ZZTEST-REF-G" });
    assert.equal(ref.refundInr, 250);
  }));

  test("early exit before payment: owner owes 50% (due_50), then pays it; no further refund; day 16 refused", () => withEnv(MODEL, async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-owner-e", "ZZ TEST Owner Early", "LISTING");
    await person(pg, "zz-tenant-e", "ZZ TEST Tenant Early");
    await person(pg, "zz-tenant-e2", "ZZ TEST Tenant Early Two");
    await listing(pg, "ZZLE", "zz-owner-e", 5999);
    await listing(pg, "ZZLE2", "zz-owner-e", 5999);
    const today = istYmd(new Date());
    const { commission: c } = await flow(pg, sql, { owner: "zz-owner-e", tenant: "zz-tenant-e", listingId: "ZZLE", rent: 5999, enquiryDaysAgo: 2 });
    assert.ok(c);
    await assert.rejects(recordEarlyExit(sql, c.id, "zz-admin", addDays(today, 16)), /more than 15 days/);
    await assert.rejects(recordEarlyExit(sql, c.id, "zz-admin", addDays(today, -1)), /before the move-in/);
    const e = await recordEarlyExit(sql, c.id, "zz-admin", addDays(today, 15));
    assert.equal(e.status, "due_50");
    assert.equal(e.amountDueInr, 250);
    assert.equal(e.feeInr, 499, "the full fee stays on record");
    assert.equal(e.earlyExit, true);
    assert.equal(e.vacatedOn, addDays(today, 15));
    await assert.rejects(recordEarlyExit(sql, c.id, "zz-admin", addDays(today, 3)), /only be recorded on an unpaid commission/);
    await assert.rejects(recordCommissionRefund(sql, c.id, "zz-admin", { vacatedOn: addDays(today, 3), refundedOn: today, ref: "x" }), /Only a paid commission|early exit/);
    const paid = await markCommissionPaid(sql, c.id, "zz-admin", today, "ZZTEST-PAY-E");
    assert.equal(paid.status, "paid");
    assert.equal(paid.paidInr, 250);
    await assert.rejects(recordCommissionRefund(sql, c.id, "zz-admin", { vacatedOn: addDays(today, 3), refundedOn: today, ref: "x" }), /early exit/);
    // GST on: early exit owes 50% of the commission and 50% of the GST.
    await withEnv({ ...MODEL, OWNER_FEE_GST_ENABLED: "true" }, async () => {
      const { commission: g } = await flow(pg, sql, { owner: "zz-owner-e", tenant: "zz-tenant-e2", listingId: "ZZLE2", rent: 5999, enquiryDaysAgo: 2 });
      assert.ok(g);
      assert.equal((await recordEarlyExit(sql, g.id, "zz-admin", today)).amountDueInr, 250);
    });
  }));

  test("squad move-in: one flat ₹499 per bed (per tenant), rent share still recorded, idempotent", () => withEnv(MODEL, async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-owner-s", "ZZ TEST Owner Squad", "LISTING");
    for (const t of ["zz-sq-a", "zz-sq-b", "zz-sq-c"]) await person(pg, t, `ZZ TEST ${t}`);
    await listing(pg, "ZZLS", "zz-owner-s", 6999);
    await pg.query(`insert into squads (id, creator_id, name, area, budget_per_person, size, invite_code) values ('ZZSQ','zz-sq-a','ZZ TEST Squad','Bunder',7000,3,'ZZTESTSQ')`);
    for (const t of ["zz-sq-a", "zz-sq-b", "zz-sq-c"]) await pg.query(`insert into squad_members (squad_id, user_id, joined_at) values ('ZZSQ',$1, now() - interval '30 days')`, [t]);
    // c left the squad before moving in → no commission for c.
    await pg.query(`update squad_members set left_at = now() - interval '1 day' where user_id = 'zz-sq-c'`);
    await pg.query(`insert into squad_requests (id, squad_id, listing_id, owner_id, status, created_at) values ('ZZSR','ZZSQ','ZZLS','zz-owner-s','ACCEPTED', now() - interval '12 days')`);
    await pg.query(`insert into squad_move_ins (id, squad_request_id, squad_id, listing_id, owner_id, owner_confirmed_at, confirmed_at) values ('ZZSM','ZZSR','ZZSQ','ZZLS','zz-owner-s', now(), now())`);
    for (const t of ["zz-sq-a", "zz-sq-b", "zz-sq-c"]) await pg.query(`insert into squad_move_in_confirms (squad_move_in_id, user_id) values ('ZZSM',$1)`, [t]);
    assert.ok(await firstEnquiryAt(sql, "zz-sq-a", "zz-owner-s"), "squad request counts as the first enquiry");
    assert.equal(await commissionsOnSquadMoveIn(sql, "ZZSM"), null, "squad move-in no longer charges the owner (deposit marks only)");
    assert.equal((await allCommissions(sql)).length, 0);
    const res = await createCommissionsForSquadMoveIn(sql, "ZZSM", { force: true }); // admin-only legacy path
    assert.equal(res.filter((r) => r.created).length, 2);
    const rows = (await allCommissions(sql)).filter((c) => c.squad);
    assert.equal(rows.length, 2, "one per bed: a and b");
    assert.deepEqual(rows.map((c) => c.tenantId).sort(), ["zz-sq-a", "zz-sq-b"]);
    for (const c of rows) {
      assert.match(c.moveInId, /^squad:ZZSM:zz-sq-[ab]$/);
      assert.equal(c.rentInr, 3500); // ₹6,999 unit split by 2 tenants → ₹3,499.50 → ₹3,500 each
      assert.equal(c.feeInr, 499); // flat per tenant
      assert.equal(c.totalInr, 499);
      assert.equal(c.attributionDays, 12);
    }
    assert.equal((await ownerCommissions(sql, "zz-owner-s")).length, 2);
    assert.equal((await createCommissionsForSquadMoveIn(sql, "ZZSM", { force: true })).filter((r) => r.created).length, 0, "re-running never doubles");
    assert.equal((await allCommissions(sql)).length, 2);
  }));

  test("founding host pays ₹0: a 'waived' row, nothing due, no payment link; after the end date the flat ₹499 applies", () => withEnv(MODEL, async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-owner-2", "ZZ TEST Founding Owner", "LISTING");
    await person(pg, "zz-tenant-2", "ZZ TEST Tenant Two");
    await person(pg, "zz-tenant-3", "ZZ TEST Tenant Three");
    await listing(pg, "ZZL2", "zz-owner-2", 5999);
    const today = istYmd(new Date());
    const set = await setFoundingPartner(sql, "zz-owner-2", "zz-admin", { on: true, note: "ZZ TEST brought 2 PGs" });
    assert.equal(set.foundingUntil, (await import("./owner-fee.ts")).defaultFoundingUntil(today));
    const { commission: c, body } = await flow(pg, sql, { owner: "zz-owner-2", tenant: "zz-tenant-2", listingId: "ZZL2", rent: 5999, enquiryDaysAgo: 3 });
    assert.doesNotMatch(body, /15%|₹900/);
    assert.ok(c);
    assert.equal(c.ratePct, 0);
    assert.equal(c.founding, true);
    assert.equal(c.feeInr, 0);
    assert.equal(c.gstInr, 0);
    assert.equal(c.totalInr, 0);
    assert.equal(c.amountDueInr, 0);
    assert.equal(c.status, "waived");
    const raw = (await pg.query<{ payment_link_mode: string; payment_link_ref: string }>(`select payment_link_mode, payment_link_ref from owner_commissions where id = $1`, [c.id])).rows[0];
    assert.equal(raw.payment_link_mode, "none", "no payment link / invoice for ₹0");
    assert.equal(raw.payment_link_ref, "");
    const note = (await pg.query<{ title: string; body: string }>(`select title, body from notifications where user_id = 'zz-owner-2' and href = '/owner-fees'`)).rows;
    assert.equal(note.length, 1);
    assert.match(note[0].title, /founding partner/i);
    assert.doesNotMatch(note[0].body, /due by|payment link|₹499/);
    assert.equal(await hostFoundingNow(sql, "zz-owner-2"), true);
    await assert.rejects(markCommissionPaid(sql, c.id, "zz-admin", today, "ZZ"), /Only a due commission/);
    // Founding period over (ended yesterday) → next move-in is 20%. Past end dates can't be set through the admin path.
    await assert.rejects(setFoundingPartner(sql, "zz-owner-2", "zz-admin", { on: true, until: addDays(today, -1) }), /in the past/);
    await pg.query(`update host_fee_settings set founding_until = $1::date where owner_id = 'zz-owner-2'`, [addDays(today, -1)]);
    await pg.query(`insert into listings (id, property_id, owner_id, title, description, city_name, locality_name, monthly_rent, deposit, available_from, room_type, furnished)
      values ('ZZL3','P-ZZL2','zz-owner-2','ZZ TEST bed 2','ZZ TEST','Mangaluru','Bunder',8999,8999,'2026-11-01','Shared room','Furnished')`);
    const second = await flow(pg, sql, { owner: "zz-owner-2", tenant: "zz-tenant-3", listingId: "ZZL3", rent: 8999, enquiryDaysAgo: 1 });
    assert.equal(second.commission?.ratePct, 0);
    assert.equal(second.commission?.founding, false);
    assert.equal(second.commission?.feeInr, 499);
  }));

  test("without migration 0032's commission block: the mark is kept, no fee row is written", () => withEnv(MODEL, async () => {
    const { pg, sql } = await testDb();
    await pg.exec(`alter table owner_commissions drop constraint owner_commissions_status_v2_check`);
    assert.equal(await waivedRowsSupported(sql), false);
    await person(pg, "zz-owner-w", "ZZ TEST Founding Owner W", "LISTING");
    await person(pg, "zz-tenant-w", "ZZ TEST Tenant W");
    await listing(pg, "ZZLW", "zz-owner-w", 6999);
    await setFoundingPartner(sql, "zz-owner-w", "zz-admin", { on: true });
    const { commission, mark } = await flow(pg, sql, { owner: "zz-owner-w", tenant: "zz-tenant-w", listingId: "ZZLW", rent: 6999, enquiryDaysAgo: 2 });
    assert.equal(commission, null);
    assert.equal(mark.commission && !mark.commission.created ? mark.commission.reason : "", "not_migrated");
    assert.equal(mark.mark.receivedOn, istYmd(new Date()));
  }));

  test("0031 leaves existing rows unchanged, rejects ₹0 rows that aren't 'waived', and is safe to re-run", () => withEnv(MODEL, async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-owner-x", "ZZ TEST Owner X", "LISTING");
    await person(pg, "zz-tenant-x", "ZZ TEST Tenant X");
    await listing(pg, "ZZLX", "zz-owner-x", 5999);
    const { commission: c } = await flow(pg, sql, { owner: "zz-owner-x", tenant: "zz-tenant-x", listingId: "ZZLX", rent: 5999, enquiryDaysAgo: 4 });
    assert.ok(c);
    const before = (await pg.query(`select * from owner_commissions order by id`)).rows;
    const { readFileSync } = await import("node:fs");
    const { migrationsDir } = await import("./pgtest.ts");
    await pg.exec(readFileSync(new URL("0031_founding_waived.sql", migrationsDir), "utf8"));
    assert.deepEqual((await pg.query(`select * from owner_commissions order by id`)).rows, before, "re-run changes nothing");
    assert.equal(c.status, "due");
    assert.equal(c.totalInr, 499);
    await assert.rejects(pg.query(`update owner_commissions set fee_inr = 0, total_inr = 0, amount_due_inr = 0 where id = $1`, [c.id]), /check/i);
    await assert.rejects(pg.query(`update owner_commissions set status = 'bogus' where id = $1`, [c.id]), /check/i);
  }));

  test("attribution window: day 59 and 60 create a commission, day 61 doesn't", () => withEnv(MODEL, async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-owner-4", "ZZ TEST Owner Four", "LISTING");
    const results: Record<number, unknown> = {};
    for (const [i, days, rent] of [[1, 59, 6999], [2, 60, 7999], [3, 61, 8999]] as const) {
      await person(pg, `zz-t4-${i}`, `ZZ TEST Tenant ${i}`);
      await listing(pg, `ZZL4${i}`, "zz-owner-4", rent);
      const r = await flow(pg, sql, { owner: "zz-owner-4", tenant: `zz-t4-${i}`, listingId: `ZZL4${i}`, rent, enquiryDaysAgo: days });
      results[days] = r.commission;
    }
    const d59 = results[59] as { feeInr: number; attributionDays: number };
    const d60 = results[60] as { feeInr: number; attributionDays: number };
    assert.equal(d59.attributionDays, 59);
    assert.equal(d59.feeInr, 499);
    assert.equal(d60.attributionDays, 60);
    assert.equal(d60.feeInr, 499);
    assert.equal(results[61], null);
  }));

  test("first enquiry can be a chat message; earliest of request and chat wins", async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-owner-5", "ZZ TEST Owner Five", "LISTING");
    await person(pg, "zz-tenant-5", "ZZ TEST Tenant Five");
    await listing(pg, "ZZL5", "zz-owner-5", 6999);
    await pg.query(`insert into conversations (id, listing_id) values ('ZZC5','ZZL5')`);
    await pg.query(`insert into messages (id, conversation_id, sender_id, body, created_at) values ('ZZM5','ZZC5','zz-tenant-5','hi', now() - interval '20 days')`);
    await pg.query(`insert into applications (id, listing_id, seeker_id, host_id, status, created_at) values ('ZZA5','ZZL5','zz-tenant-5','zz-owner-5','PENDING', now() - interval '5 days')`);
    const at = await firstEnquiryAt(sql, "zz-tenant-5", "zz-owner-5");
    assert.ok(at);
    assert.equal(Math.round((Date.now() - Date.parse(at)) / 86_400_000), 20);
    assert.equal(await firstEnquiryAt(sql, "zz-tenant-5", "someone-else"), null);
  });

  test("switch off (code default) → move-in creates no commission", () => withEnv({}, async () => {
    const { pg, sql } = await testDb();
    await person(pg, "zz-owner-6", "ZZ TEST Owner Six", "LISTING");
    await person(pg, "zz-tenant-6", "ZZ TEST Tenant Six");
    await listing(pg, "ZZL6", "zz-owner-6", 5999);
    const r = await flow(pg, sql, { owner: "zz-owner-6", tenant: "zz-tenant-6", listingId: "ZZL6", rent: 5999, enquiryDaysAgo: 2 });
    assert.equal(r.commission, null);
    assert.equal(Number((await pg.query<{ n: number }>(`select count(*)::int n from owner_commissions`)).rows[0].n), 0);
  }));

  test("prod today (ROOMEO_FEE_ENABLED on) + OWNER_FEE_ENABLED on → no commission (no double charge), tenant fee still shown", () =>
    withEnv({ ROOMEO_FEE_ENABLED: "true", OWNER_FEE_ENABLED: "true" }, async () => {
      const { pg, sql } = await testDb();
      await person(pg, "zz-owner-7", "ZZ TEST Owner Seven", "LISTING");
      await person(pg, "zz-tenant-7", "ZZ TEST Tenant Seven");
      await listing(pg, "ZZL7", "zz-owner-7", 5999);
      assert.match(feeLine(feeViewOf(pricingConfig())), /₹499 \(incl\. GST\)/);
      await pg.query(`insert into applications (id, listing_id, seeker_id, host_id, status) values ('ZZA7','ZZL7','zz-tenant-7','zz-owner-7','ACCEPTED')`);
      for (const side of ["seeker", "owner"] as const)
        await confirmMoveInRecord(sql, { applicationId: "ZZA7", listingId: "ZZL7", seekerId: "zz-tenant-7", ownerId: "zz-owner-7", side, notifyUserId: null });
      assert.equal(Number((await pg.query<{ n: number }>(`select count(*)::int n from owner_commissions`)).rows[0].n), 0);
    }));

  test("migration 0027 not applied → move-in still confirms (commission skipped, no throw)", () => withEnv(MODEL, async () => {
    const { pg, sql } = await testDb();
    await pg.exec(`drop table owner_commissions; drop table host_fee_settings;`);
    await person(pg, "zz-owner-8", "ZZ TEST Owner Eight", "LISTING");
    await person(pg, "zz-tenant-8", "ZZ TEST Tenant Eight");
    await listing(pg, "ZZL8", "zz-owner-8", 5999);
    await pg.query(`insert into applications (id, listing_id, seeker_id, host_id, status) values ('ZZA8','ZZL8','zz-tenant-8','zz-owner-8','ACCEPTED')`);
    const orig = console.error;
    console.error = () => {};
    try {
      await confirmMoveInRecord(sql, { applicationId: "ZZA8", listingId: "ZZL8", seekerId: "zz-tenant-8", ownerId: "zz-owner-8", side: "seeker", notifyUserId: null });
      const r = await confirmMoveInRecord(sql, { applicationId: "ZZA8", listingId: "ZZL8", seekerId: "zz-tenant-8", ownerId: "zz-owner-8", side: "owner", notifyUserId: null });
      assert.equal(r.confirmed, true);
    } finally {
      console.error = orig;
    }
  }));

  test("migration 0027 not applied → admin commission actions answer a friendly message, not an error (no 500)", async () => {
    const { pg, sql } = await testDb();
    await pg.exec(`drop table owner_commissions; drop table host_fee_settings;`);
    await person(pg, "zz-owner-9", "ZZ TEST Owner Nine", "LISTING");
    const today = istYmd(new Date());
    for (const action of [
      () => setFoundingPartner(sql, "zz-owner-9", "zz-admin", { on: true }),
      () => markCommissionPaid(sql, "00000000-0000-4000-8000-000000000001", "zz-admin", today, "x"),
      () => recordEarlyExit(sql, "00000000-0000-4000-8000-000000000001", "zz-admin", today),
      () => recordCommissionRefund(sql, "00000000-0000-4000-8000-000000000001", "zz-admin", { vacatedOn: today, refundedOn: today, ref: "x" }),
    ] as Array<() => Promise<unknown>>) assert.deepEqual(await withCommissionTables(action), { ok: false, error: COMMISSION_TABLES_MISSING });
    // Lists: the API catches this and returns empty lists.
    await assert.rejects(allCommissions(sql), (e) => isMissingCommissionTable(e));
    await assert.rejects(ownerCommissions(sql, "zz-owner-9"), (e) => isMissingCommissionTable(e));
    assert.equal(await hostRateNow(sql, "zz-owner-9"), 20);
    // Other errors still throw.
    await assert.rejects(withCommissionTables(async () => { throw new Error("boom"); }), /boom/);
    assert.deepEqual(await withCommissionTables(async () => 7), { ok: true, row: 7 });
  });
});
