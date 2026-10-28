import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PHOTOS, canEditListing, editOf, editQuality, photosToDelete, validKeeps } from "./listing-edit.ts";

const jpeg = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(7)]).toString("base64");
const ID = "566aab6a-91ba-4d67-acaf-a02a3bcfc0e2";
const P1 = "11111111-1111-4111-8111-111111111111";
const base = { id: ID, monthlyRent: "7500", deposit: 7500, furnished: "Furnished", availableFrom: "2026-11-01", description: "  AC twin room near Bunder  ", amenities: { wifi: true, ac: true, food: "yes" }, keepPhotoIds: [P1, P1] };

test("valid edit is normalised", () => {
  const e = editOf(base);
  assert.equal(e.monthlyRent, 7500);
  assert.equal(e.description, "AC twin room near Bunder");
  assert.equal(e.amenities.wifi, true);
  assert.equal(e.amenities.food, false, "only literal true turns an amenity on");
  assert.equal(e.amenities.parking, false);
  assert.deepEqual(e.keepPhotoIds, [P1], "duplicate keeps collapse");
});

test("rejects bad prices, deposit, date and furnishing", () => {
  assert.throws(() => editOf({ ...base, monthlyRent: 100 }), /rent/i);
  assert.throws(() => editOf({ ...base, monthlyRent: "abc" }), /rent/i);
  assert.throws(() => editOf({ ...base, deposit: 7500 * 13 }), /Deposit/);
  assert.throws(() => editOf({ ...base, deposit: -1 }), /Deposit/);
  assert.throws(() => editOf({ ...base, availableFrom: "next week" }), /date/);
  assert.throws(() => editOf({ ...base, furnished: "Palace" }), /furnished/i);
  assert.throws(() => editOf({ ...base, id: "x; drop table" }), /Unknown room/);
});

test("photo rules: at least one, at most eight, real images only", () => {
  assert.throws(() => editOf({ ...base, keepPhotoIds: [], newPhotos: [] }), /at least one/);
  assert.throws(() => editOf({ ...base, newPhotos: Array.from({ length: MAX_PHOTOS }, () => ({ url: jpeg })) }), /Up to 8/);
  assert.throws(() => editOf({ ...base, newPhotos: [{ url: "data:image/jpeg;base64,PHN2Zz48L3N2Zz4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }] }));
  const e = editOf({ ...base, keepPhotoIds: [], newPhotos: [{ url: jpeg }] });
  assert.equal(e.newPhotos[0].category, "Bedroom");
});

test("owners edit their own rooms, admins edit any", () => {
  assert.ok(canEditListing("u1", "u1", []));
  assert.ok(!canEditListing("u1", "u2", ["HOST"]));
  assert.ok(canEditListing("u1", "u2", ["ADMIN"]));
  assert.ok(canEditListing("u1", "u2", ["SUPER_ADMIN"]));
  assert.ok(!canEditListing("u1", "", ["ADMIN"]));
});

test("photo diff keeps only this listing's photos", () => {
  assert.deepEqual(photosToDelete(["a", "b", "c"], ["c", "a"]), ["b"]);
  assert.deepEqual(validKeeps(["a", "b"], ["b", "zzz", "a"]), ["b", "a"]);
  assert.equal(editQuality(2, "x".repeat(81), "Furnished"), 79);
  assert.equal(editQuality(10, "", "Unfurnished"), 70);
});
