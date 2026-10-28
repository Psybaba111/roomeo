import { test } from "node:test";
import assert from "node:assert/strict";
import { badListingId, listingGone } from "./listing-gone.ts";

test("listingGone", () => {
  assert.equal(listingGone(undefined), true);
  assert.equal(listingGone({ status: "REMOVED" }), true);
  assert.equal(listingGone({ status: "ACTIVE", account_status: "SUSPENDED" }), true);
  assert.equal(listingGone({ status: "PAUSED", account_status: "ACTIVE" }), false);
  assert.equal(listingGone({ status: "ACTIVE" }), false);
});

test("badListingId", () => {
  assert.equal(badListingId("566aab6a-91ba-4d67-acaf-a02a3bcfc0e2"), false);
  assert.equal(badListingId("../etc"), true);
  assert.equal(badListingId(42), true);
});
