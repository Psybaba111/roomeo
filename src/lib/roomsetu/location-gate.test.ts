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

test("maps link prefers the exact pin, falls back to the street address", () => {
  const pin = mapsUrl("MPT Road, Bunder, Mangaluru, Karnataka 575001", "575001", 12.867513, 74.834487);
  assert.equal(pin, "https://www.google.com/maps/search/?api=1&query=12.867513%2C74.834487");
  const text = decodeURIComponent(mapsUrl("MPT Road, Bunder, Mangaluru, Karnataka 575001", "575001", 0, 0));
  assert.ok(text.includes("MPT Road, Bunder") && !text.includes("575001 575001"));
  assert.ok(decodeURIComponent(mapsUrl("MPT Road", "575001", Number.NaN, 74.8)).endsWith("MPT Road 575001"));
  assert.equal(mapsUrl("", "", 0, 0), "");
});

test("locked line names both conditions", () => {
  assert.match(LOCKED_LOCATION_LINE, /sign the agreement/);
  assert.match(LOCKED_LOCATION_LINE, /589/);
});
