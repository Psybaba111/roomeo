import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CITY, budgetHints, citySearchPaths, citySeoTitle, isSearchCity, searchCity, areaCentroid } from "./cities.ts";

test("no city is the default", () => {
  assert.equal(DEFAULT_CITY, "");
  assert.equal(searchCity(""), "");
  assert.equal(searchCity(undefined), "");
  assert.equal(searchCity("<script>"), "");
});

test("any typed city is accepted and normalised", () => {
  assert.equal(searchCity("mumbai"), "Mumbai");
  assert.equal(searchCity("  new   delhi "), "New Delhi");
  assert.equal(searchCity("bangalore"), "Bengaluru");
  assert.equal(searchCity("Mangalore"), "Mangaluru");
  assert.ok(isSearchCity("Pune"));
});

test("no city is featured", () => {
  assert.deepEqual(citySearchPaths(), []);
  assert.equal(budgetHints("Mangaluru").placeholder, budgetHints("Pune").placeholder);
  assert.equal(citySeoTitle(""), "Spare beds and PG rooms");
  assert.deepEqual(areaCentroid("Pune", "Nowhere", [1, 2]), [1, 2]);
});
