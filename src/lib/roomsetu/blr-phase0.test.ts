// Bengaluru Phase 0 (17 Nov 2026): Bengaluru areas, ₹499 all-in fee split, invoice paise, image URLs, migration 0030.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { areaOptions, BENGALURU_LAUNCH_AREAS, citySearchPaths, LAUNCH_CITIES, isSearchCity } from "./cities.ts";
import { successFeeSplit, feeWithGst } from "./deal-agreement.ts";
import { invoiceAmounts, invoiceAmountsInclusive, successFeeInvoiceAmounts } from "./invoice.ts";
import { successFeeInr, pricingConfig, SUCCESS_FEE_INR } from "./pricing.ts";
import { flatCommissionAmounts, commissionLine, ownerCommissionNote, ownerFeeFlatInr, refundInr, earlyExitDueInr } from "./owner-fee.ts";
import { decodeDataUrl, imageUrlSql, isImageId, LISTING_IMAGE_PATH } from "./listing-image.ts";
import { validateWaitlist } from "./waitlist.ts";
import { testDb, migrationsDir } from "./pgtest.ts";
import { saveUtm } from "../analytics/utm-db.ts";

describe("Bengaluru areas", () => {
  test("launch areas come first for Bengaluru, de-duplicated with the DB list", () => {
    const a = areaOptions("Bengaluru", ["Koramangala", "koramangala ", "Indiranagar"]);
    assert.deepEqual(a.slice(0, 5), ["Koramangala", "HSR Layout", "Bellandur", "Whitefield", "Electronic City"]);
    assert.equal(a.filter((x) => x.toLowerCase() === "koramangala").length, 1);
    assert.ok(a.includes("Indiranagar"));
    assert.deepEqual([...BENGALURU_LAUNCH_AREAS], ["Koramangala", "HSR Layout", "Bellandur", "Whitefield", "Electronic City"]);
  });
  test("Mangaluru keeps its own areas and gets no Bengaluru ones", () => {
    const m = areaOptions("Mangaluru", ["Bunder"]);
    assert.ok(m.includes("Bunder") && m.includes("Kankanady"));
    assert.ok(!m.some((x) => (BENGALURU_LAUNCH_AREAS as readonly string[]).includes(x)));
  });
  test("both launch cities are search cities and in the sitemap", () => {
    assert.deepEqual([...LAUNCH_CITIES], ["Bengaluru", "Mangaluru"]);
    assert.ok(isSearchCity("Bengaluru") && isSearchCity("Mangaluru"));
    assert.deepEqual(citySearchPaths(), ["/search?city=Bengaluru", "/search?city=Mangaluru"]);
  });
  test("waitlist city field accepts Bengaluru", () => {
    assert.equal(validateWaitlist({ name: "ZZ TEST Blr", contact: "zz.test.blr@example.com", city: "Bengaluru", role: "tenant", consent: true }).city, "Bengaluru");
  });
});

describe("₹499 all-in including GST (tenant and owner)", () => {
  test("split is ₹422.88 + ₹76.12 (CGST ₹38.06 + SGST ₹38.06), 49900 paise exactly", () => {
    const s = successFeeSplit(499);
    assert.deepEqual([s.basePaise, s.gstPaise, s.cgstPaise, s.sgstPaise, s.totalPaise], [42288, 7612, 3806, 3806, 49900]);
    assert.equal(s.basePaise + s.cgstPaise + s.sgstPaise, 49900);
    assert.equal(s.total, 499);
    assert.equal(SUCCESS_FEE_INR, 499);
  });
  test("invoice: intra-state CGST/SGST and inter-state IGST both sum to 49900 paise, no round-off", () => {
    const ka = invoiceAmountsInclusive(499, "Karnataka");
    assert.deepEqual([ka.taxable, ka.cgst, ka.sgst, ka.igst, ka.roundOff, ka.total], [42288, 3806, 3806, 0, 0, 49900]);
    assert.equal(ka.taxable + ka.cgst + ka.sgst + ka.igst + ka.roundOff, 49900);
    const mh = invoiceAmountsInclusive(499, "Maharashtra");
    assert.deepEqual([mh.taxable, mh.cgst, mh.sgst, mh.igst, mh.roundOff, mh.total], [42288, 0, 0, 7612, 0, 49900]);
    assert.deepEqual(successFeeInvoiceAmounts(499, 0, 422.88, null, 499), invoiceAmountsInclusive(499, null));
  });
  test("no rounding drift for any whole-rupee fee from ₹1 to ₹5,000", () => {
    for (let r = 1; r <= 5000; r++) {
      const a = invoiceAmountsInclusive(r, "Karnataka");
      assert.equal(a.taxable + a.cgst + a.sgst + a.roundOff, r * 100, String(r));
      const s = successFeeSplit(r);
      assert.equal(s.basePaise + s.cgstPaise + s.sgstPaise, r * 100, String(r));
    }
  });
  test("₹589 = ₹499 + 18% GST (588.82 rounded); a pre-change ₹589 payment keeps its old invoice", () => {
    assert.deepEqual(feeWithGst(499), { base: 499, gst: 89.82, exact: 588.82, total: 589 });
    assert.deepEqual(successFeeInvoiceAmounts(589, 0, 499.15, "Karnataka", 499), invoiceAmounts(499.15, "Karnataka", 589));
    // ₹490 = ₹589 less the ₹99 trial credit: GST-inclusive, as before.
    assert.deepEqual(successFeeInvoiceAmounts(490, 99, 415.25, "Karnataka", 499), invoiceAmountsInclusive(490, "Karnataka"));
    // ₹400 = ₹499 less the ₹99 trial credit.
    assert.equal(successFeeInvoiceAmounts(400, 99, 338.98, null, 499).total, 40000);
  });
  test("amount is config-driven (ROOMEO_SUCCESS_FEE_INR, all-in), safe default ₹499", () => {
    assert.equal(successFeeInr({}), 499);
    assert.equal(successFeeInr({ ROOMEO_SUCCESS_FEE_INR: "599" }), 599);
    for (const bad of ["0", "-1", "abc", "499.5", "1000001"]) assert.equal(successFeeInr({ ROOMEO_SUCCESS_FEE_INR: bad }), 499, bad);
    const c = pricingConfig({ ROOMEO_FEE_ENABLED: "true" });
    assert.equal(c.successFeeTenantInr, 499);
    assert.equal(c.successFeeOwnerInr, 499);
  });
  test("Razorpay charges 49900 paise", () => {
    assert.equal(successFeeSplit(pricingConfig({ ROOMEO_FEE_ENABLED: "true" }).successFeeTenantInr).totalPaise, 49900);
  });
  test("owner fee: flat ₹499 all-in; GST on → ₹423 + ₹76; GST off → ₹499; 50% early exit = ₹250", () => {
    assert.deepEqual(flatCommissionAmounts(8000, 18), { rentInr: 8000, ratePct: 0, feeInr: 423, gstPct: 18, gstInr: 76, totalInr: 499 });
    assert.deepEqual(flatCommissionAmounts(8000, 0), { rentInr: 8000, ratePct: 0, feeInr: 499, gstPct: 0, gstInr: 0, totalInr: 499 });
    assert.equal(flatCommissionAmounts(15000, 18).totalInr, 499, "same for any rent");
    assert.equal(refundInr(423, 76), 250);
    assert.equal(earlyExitDueInr(499, 0), 250);
    assert.equal(ownerFeeFlatInr({}), 499);
    assert.equal(ownerFeeFlatInr({ OWNER_FEE_INR: "599" }), 599);
    assert.equal(ownerFeeFlatInr({ OWNER_FEE_INR: "x" }), 499);
    assert.equal(commissionLine({ ratePct: 0, rentInr: 8000, feeInr: 423, gstPct: 18, gstInr: 76, totalInr: 499, founding: false }), "Flat ₹499 per tenant, GST included (₹423 + ₹76 GST 18%)");
    assert.match(commissionLine({ ratePct: 20, rentInr: 6000, feeInr: 1200, gstPct: 0, gstInr: 0, totalInr: 1200, founding: false }), /20%/, "old % rows keep their line");
    assert.match(ownerCommissionNote(flatCommissionAmounts(8000, 18), 2), /flat ₹499 \(GST included: ₹423 \+ ₹76 GST\) per tenant, for each of the 2 tenants \(₹998 in all\)/);
  });
});

describe("listing photos are URLs, not base64, in public payloads", () => {
  test("helpers", () => {
    assert.equal(LISTING_IMAGE_PATH, "/api/img/");
    assert.throws(() => imageUrlSql("i; drop table x"));
    assert.equal(isImageId("abc-123_XY"), true);
    assert.equal(isImageId("../etc"), false);
    const d = decodeDataUrl("data:image/png;base64,iVBORw0KGgo=");
    assert.equal(d?.type, "image/png");
    assert.deepEqual([...(d?.bytes ?? [])].slice(0, 4), [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(decodeDataUrl("data:image/svg+xml;base64,PHN2Zz4="), null, "no SVG");
    assert.equal(decodeDataUrl("https://example.com/a.jpg"), null);
  });
  test("SQL expression maps data: URLs to /api/img/<id> and leaves https URLs alone", async () => {
    const { pg } = await testDb();
    const r = await pg.query<{ u: string }>(`select ${imageUrlSql("i")} as u from (values ('img1', 'data:image/jpeg;base64,AAAA'), ('img2', 'https://cdn.example.com/p.jpg')) as i (id, url) order by id`);
    assert.deepEqual(r.rows.map((x) => x.u), ["/api/img/img1", "https://cdn.example.com/p.jpg"]);
    await pg.close();
  });
});

describe("migration 0030 (preview only until approved)", () => {
  test("adds nullable UTM columns, Bengaluru areas, flat owner-fee rows; safe to re-run", async () => {
    const { pg, sql } = await testDb();
    await pg.exec(readFileSync(new URL("0030_blr_utm_flat_fee.sql", migrationsDir), "utf8")); // second run
    const cols = await pg.query<{ t: string; c: string; n: string }>(`select table_name t, column_name c, is_nullable n from information_schema.columns where column_name like 'utm_%' order by 1, 2`);
    assert.deepEqual(cols.rows.map((r) => `${r.t}.${r.c}:${r.n}`), [
      "listings.utm_campaign:YES", "listings.utm_medium:YES", "listings.utm_source:YES",
      "user.utm_campaign:YES", "user.utm_medium:YES", "user.utm_source:YES",
      "waitlist_signups.utm_campaign:YES", "waitlist_signups.utm_medium:YES", "waitlist_signups.utm_source:YES",
    ]);
    const areas = await pg.query<{ name: string }>(`select l.name from localities l join cities c on c.id = l.city_id where c.name = 'Bengaluru' order by l.name`);
    for (const a of BENGALURU_LAUNCH_AREAS) assert.ok(areas.rows.some((r) => r.name === a), a);
    assert.equal(areas.rows.filter((r) => r.name === "HSR Layout").length, 1);
    await pg.query(`insert into "user" (id, name, email, "emailVerified") values ('zz-u1','ZZ TEST','zz.utm@example.com',true)`);
    assert.equal(await saveUtm(sql, "user", "zz-u1", { source: "instagram", medium: "paid", campaign: "blr_launch" }), "saved");
    assert.equal(await saveUtm(sql, "user", "zz-u1", { source: "google", medium: "cpc", campaign: null }), "saved");
    const u = (await pg.query<{ s: string; m: string }>(`select utm_source s, utm_medium m from "user" where id = 'zz-u1'`)).rows[0];
    assert.deepEqual([u.s, u.m], ["instagram", "paid"], "first touch kept");
    await pg.close();
  });
  test("a DB without 0030 (prod today) skips saving instead of failing", async () => {
    const { pg, sql } = await testDb();
    await pg.exec(`alter table "user" drop column utm_source; alter table "user" drop column utm_medium; alter table "user" drop column utm_campaign;`);
    assert.equal(await saveUtm(sql, "user", "nobody", { source: "instagram", medium: null, campaign: null }), "no_columns");
    await pg.close();
  });
});
