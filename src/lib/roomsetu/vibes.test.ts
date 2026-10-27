import test from "node:test";
import assert from "node:assert/strict";
import { vibeTags } from "./vibes.ts";

test("vibes come from listing facts, capped", () => {
  assert.deepEqual(vibeTags({ wifi: true, pets_allowed: "t", food_available: true }), ["WFH-friendly", "Pet ok", "Ghar ka khana"]);
  assert.deepEqual(vibeTags({ kitchen: true, smoking_allowed: false }), ["Cook your own", "Smoke-free"]);
  assert.deepEqual(vibeTags({ guest_policy: "No curfew, come back late" }), ["Night owl"]);
  assert.deepEqual(vibeTags({ occupation_pref: "Student" }), ["Student-friendly"]);
  assert.equal(vibeTags({ wifi: 1, ac: 1, pets_allowed: 1, food_available: 1 }, 2).length, 2);
  assert.deepEqual(vibeTags({}), []);
  assert.deepEqual(vibeTags({ wifi: false, smoking_allowed: undefined }), []);
});
