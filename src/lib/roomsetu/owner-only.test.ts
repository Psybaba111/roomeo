// Owner-only and broker-blocking checks (P0 broker plan). Pure rules + PGlite. ZZ TEST data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVE_LISTING_CAP, BROKER_REPORT_REASON, OWNER_DECLARATION, PENDING_REVIEW, contactDetailError, findContactDetails,
  isVerifiedPhoneTaken, phoneKey, sharedPhoneGroups, statusForNewListing,
} from "./owner-only.ts";
import { REPORT_CATEGORIES } from "./constants.ts";
import { testDb, seedListing } from "./pgtest.ts";
import { activeListingCount, flaggedForReview, markFlagReviewed, newListingStatus, ownerActivateStatus, recordOwnerDeclaration } from "./owner-only-db.ts";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

test("declaration allows owners and operators with legal control, bans intermediaries", () => {
  assert.match(OWNER_DECLARATION, /own this bed or have the legal right to rent it out/);
  assert.match(OWNER_DECLARATION, /PG operator who leases/);
  assert.match(OWNER_DECLARATION, /not a broker or agent/);
  assert.doesNotMatch(OWNER_DECLARATION, /!/);
});

test("contact details are found in phones, emails, WhatsApp and links", () => {
  for (const s of ["Call 98765 43210", "+91-98765-43210", "ping 9876543210", "0 9876543210", "(+91) 98765.43210"]) assert.deepEqual(findContactDetails(s).includes("phone"), true, s);
  for (const s of ["mail a.b@gmail.com", "asha (at) gmail (dot) com"]) assert.ok(findContactDetails(s).includes("email"), s);
  for (const s of ["wa.me/919876543210", "whatsapp me", "WhatsApp on 98765"]) assert.ok(findContactDetails(s).includes("whatsapp"), s);
  for (const s of ["see www.nobroker.in", "https://x.co/abc", "roomeo.com/listing"]) assert.ok(findContactDetails(s).includes("link"), s);
  assert.deepEqual(findContactDetails("asha@gmail.com"), ["email"], "an email isn't also a link");
});

test("ordinary listing text is not flagged (rent, deposit, pincode, sizes, years, WhatsApp as a word)", () => {
  for (const s of [
    "Rent ₹12000, deposit 24000, 1200 sq ft, pincode 560034, since 2026",
    "Private room in Koramangala, Bengaluru. Furnished. Rent ₹15,000 a month.",
    "Wifi 100 mbps, 2 mins to metro, 3 BHK, 2nd floor",
    "Residents have a WhatsApp group for notices",
    "Near sector 62 noida 201301",
  ]) assert.deepEqual(findContactDetails(s), [], s);
});

test("friendly error names the field and the detail, and is calm", () => {
  assert.equal(contactDetailError({ title: "Nice room", description: "Quiet lane" }), "");
  const e = contactDetailError({ title: "Room call 9876543210", description: "" });
  assert.match(e, /^Please take the phone number out of the title\./);
  assert.match(e, /Roomeo chat/);
  assert.doesNotMatch(e, /!/);
  assert.match(contactDetailError({ description: "mail me a@b.com or wa.me/919876543210" }), /phone or WhatsApp number, email address and website link out of the description/);
  assert.match(contactDetailError({ description: "WhatsApp me on 98450 12345" }), /^Please take the phone or WhatsApp number out of the description\./);
  assert.match(contactDetailError({ description: "mail a@b.com" }), /^Please take the email address out of the description\./);
});

test("broker report reason is offered to renters", () => {
  assert.equal(BROKER_REPORT_REASON, "This is a broker");
  assert.ok((REPORT_CATEGORIES as readonly string[]).includes(BROKER_REPORT_REASON));
});

test("cap: live up to 3 beds, the 4th waits for review", () => {
  assert.equal(ACTIVE_LISTING_CAP, 3);
  assert.equal(statusForNewListing(0), "ACTIVE");
  assert.equal(statusForNewListing(2), "ACTIVE");
  assert.equal(statusForNewListing(3), PENDING_REVIEW);
  assert.equal(statusForNewListing(7), PENDING_REVIEW);
});

test("phone matching across accounts uses the last 10 digits of an Indian mobile", () => {
  assert.equal(phoneKey("+91 98765 43210"), "9876543210");
  assert.equal(phoneKey("09876543210"), "9876543210");
  assert.equal(phoneKey("12345"), "");
  assert.equal(phoneKey(null), "");
  const g = sharedPhoneGroups([
    { userId: "a", phone: "+919876543210" },
    { userId: "b", mobile: "9876543210" },
    { userId: "c", phone: "+919000000001" },
  ]);
  assert.deepEqual(g.get("a"), ["b"]);
  assert.deepEqual(g.get("b"), ["a"]);
  assert.equal(g.has("c"), false);
});

test("one account per verified phone: DB index stays, the race gets a friendly error", async () => {
  const { pg } = await testDb();
  await pg.query(`insert into profiles (user_id, full_name, phone_e164, phone_verified_at) values ('zz1','ZZ TEST A','+919876543210', now()), ('zz2','ZZ TEST B','+919876543210', null)`);
  const err = await pg.query(`update profiles set phone_verified_at = now() where user_id='zz2'`).catch((e: unknown) => e);
  assert.ok(isVerifiedPhoneTaken(err));
  assert.equal(isVerifiedPhoneTaken(new Error("other")), false);
  const api = src("./trust-api.ts");
  assert.ok(api.includes("if (taken.length) throw new Error(PHONE_TAKEN)"), "send checks first");
  assert.ok(api.includes("if (isVerifiedPhoneTaken(e)) throw new Error(PHONE_TAKEN)"), "verify maps the race");
});

async function owner3() {
  const { pg, sql } = await testDb();
  for (const id of ["L1", "L2", "L3"]) await seedListing(pg, id, "zz-owner");
  return { pg, sql };
}

test("server: a new bed above the cap waits for review; existing live beds are never taken down", async () => {
  const { pg, sql } = await owner3();
  assert.equal(await activeListingCount(sql, "zz-owner"), 3);
  assert.equal(await newListingStatus(sql, "zz-owner"), PENDING_REVIEW);
  assert.equal(await newListingStatus(sql, "someone-new"), "ACTIVE");
  // Demo beds don't count.
  await pg.query(`update listings set is_demo = true where id = 'L3'`);
  assert.equal(await newListingStatus(sql, "zz-owner"), "ACTIVE");
  await pg.query(`update listings set is_demo = false where id = 'L3'`);
  // An owner already over the cap (legacy data) keeps every live bed.
  await seedListing(pg, "L4", "zz-owner");
  assert.equal(await activeListingCount(sql, "zz-owner"), 4);
  const live = (await pg.query<{ n: number }>(`select count(*)::int n from listings where owner_id='zz-owner' and status='ACTIVE'`)).rows[0].n;
  assert.equal(live, 4);
});

test("server: Resume above the cap waits for review; a bed under review can't be put live by its owner", async () => {
  const { pg, sql } = await owner3();
  await seedListing(pg, "L4", "zz-owner");
  await pg.query(`update listings set status = 'PAUSED' where id = 'L4'`);
  assert.equal(await ownerActivateStatus(sql, "zz-owner", "L4"), PENDING_REVIEW, "3 other live beds");
  assert.equal(await ownerActivateStatus(sql, "zz-owner", "L1"), "ACTIVE", "re-saving a live bed is fine");
  await pg.query(`update listings set status = 'PAUSED' where id = 'L1'`);
  assert.equal(await ownerActivateStatus(sql, "zz-owner", "L4"), "ACTIVE", "under the cap again");
  await pg.query(`update listings set status = '${PENDING_REVIEW}' where id = 'L4'`);
  assert.equal(await ownerActivateStatus(sql, "zz-owner", "L4"), "LOCKED");
  const api = src("./account-api.ts");
  assert.ok(api.includes('if (next === "LOCKED" && data.status !== "REMOVED") throw new Error(PENDING_REVIEW_LOCKED)'));
});

test("server: createListing requires the declaration, rejects contact details and records the declaration", async () => {
  const api = src("./account-api.ts");
  const fn = api.slice(api.indexOf("export const createListing"), api.indexOf("export const setListingStatus"));
  assert.ok(fn.indexOf("if (!data.ownerDeclared) throw new Error(DECLARATION_REQUIRED)") > 0);
  assert.ok(fn.includes("contactDetailError({ title: data.title, description: data.description })"));
  assert.ok(fn.includes("ownerDeclared: (input as { ownerDeclared?: unknown } | null)?.ownerDeclared === true"), "only a real true counts");
  assert.ok(fn.includes("status = ${startStatus}") && fn.includes("recordOwnerDeclaration(sql, userId, listingId)"));
  const edit = src("./listing-edit-api.ts");
  assert.ok(edit.includes("contactDetailError({"), "edits are checked too");
  const { pg, sql } = await owner3();
  await recordOwnerDeclaration(sql, "zz-owner", "L1");
  const row = (await pg.query<{ detail: string }>(`select detail from audit_log where action = 'listing.owner_declaration' and target_id = 'L1'`)).rows[0];
  assert.match(row.detail, /^owner-v1-2026-11-19: I own this bed/);
});

test("public listing: a bed waiting for review is hidden from renters but not from its owner", () => {
  const api = src("./public-api.ts");
  assert.ok(api.includes(`const reviewPending = str(row.status) === "PENDING_REVIEW";`));
  assert.ok(api.includes("if ((!visible || reviewPending) && !isOwner)"));
});

test("admin flags: shared phones, over the cap, contact text, broker reports, pending review; mark reviewed hides one", async () => {
  const { pg, sql } = await owner3();
  await seedListing(pg, "L4", "zz-owner");
  await pg.query(`insert into profiles (user_id, full_name, mobile) values ('zz-twin','ZZ TEST twin','+91 98765 43210')`);
  await pg.query(`update listings set description = 'Call me on 98450 12345' where id = 'L2'`);
  await pg.query(`insert into reports (id, reporter_id, target_type, target_id, category) values ('r1','tenant','LISTING','L3',$1)`, [BROKER_REPORT_REASON]);
  await seedListing(pg, "L5", "zz-other");
  await pg.query(`update listings set status = '${PENDING_REVIEW}' where id = 'L5'`);
  const f = await flaggedForReview(sql);
  const owner = f.accounts.find((a) => a.userId === "zz-owner")!;
  assert.deepEqual(owner.reasons.sort(), ["OVER_CAP", "SHARED_PHONE"]);
  assert.equal(owner.liveBeds, 4);
  assert.ok(f.accounts.find((a) => a.userId === "zz-twin")?.reasons.includes("SHARED_PHONE"));
  const byId = Object.fromEntries(f.listings.map((l) => [l.id, l.reasons]));
  assert.ok(byId.L2.includes("CONTACT_IN_TEXT"));
  assert.ok(byId.L3.includes("BROKER_REPORT"));
  assert.ok(byId.L5.includes("PENDING_REVIEW"));
  // Flags never change what the owner has: all 4 beds are still live.
  assert.equal((await pg.query<{ n: number }>(`select count(*)::int n from listings where owner_id='zz-owner' and status='ACTIVE'`)).rows[0].n, 4);
  await markFlagReviewed(sql, "zz-admin", "account", "zz-owner", "OVER_CAP");
  const g = await flaggedForReview(sql);
  assert.deepEqual(g.accounts.find((a) => a.userId === "zz-owner")!.reasons, ["SHARED_PHONE"]);
});

test("create listing page shows the notice and a required declaration checkbox", () => {
  const page = src("../../routes/create-listing.tsx");
  assert.ok(page.includes('data-testid="owner-only-notice"') && page.includes("{OWNER_ONLY_NOTICE}"));
  const box = page.slice(page.indexOf('data-testid="owner-declaration"'));
  assert.ok(box.includes('type="checkbox"') && box.includes("required"));
  assert.ok(page.includes("ownerDeclared: declared"));
  assert.ok(src("../../components/admin-frame.tsx").includes('["/admin/flags", "Owner checks"]'));
});
