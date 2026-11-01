import assert from "node:assert/strict";
import test from "node:test";
import { locationUnlocked, mapsUrl, LOCKED_LOCATION_LINE } from "./location-gate.ts";

const none = { isOwner: false, isAdmin: false, signed: false, paid: false };

test("location stays locked until paid AND signed", () => {
  assert.equal(locationUnlocked(none), false);
  assert.equal(locationUnlocked({ ...none, paid: true }), false);
  assert.equal(locationUnlocked({ ...none, signed: true }), false);
  assert.equal(locationUnlocked({ ...none, signed: true, paid: true }), true);
});

test("owner and admin always see the exact location", () => {
  assert.equal(locationUnlocked({ ...none, isOwner: true }), true);
  assert.equal(locationUnlocked({ ...none, isAdmin: true }), true);
});

test("maps link searches the street address, falls back to coordinates", () => {
  const u = mapsUrl("MPT Road, Bunder, Mangaluru, Karnataka 575001", "575001", 12.864, 74.838);
  assert.ok(u.startsWith("https://www.google.com/maps/search/?api=1&query="));
  assert.ok(decodeURIComponent(u).includes("MPT Road, Bunder"));
  assert.ok(!decodeURIComponent(u).includes("575001 575001"));
  assert.ok(decodeURIComponent(mapsUrl("", "", 12.864, 74.838)).endsWith("12.864,74.838"));
  assert.equal(mapsUrl("", "", 0, 0), "");
});

test("locked line names both conditions", () => {
  assert.match(LOCKED_LOCATION_LINE, /sign the agreement/);
  assert.match(LOCKED_LOCATION_LINE, /589/);
});
