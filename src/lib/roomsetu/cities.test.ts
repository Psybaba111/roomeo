import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CITY, SEARCH_CITIES, areaCentroid, citySearchPaths, citySeoDescription, citySeoTitle, isSearchCity, searchCity } from "./cities.ts";

test("Bengaluru is the default and listed first", () => {
  assert.equal(DEFAULT_CITY, "Bengaluru");
  assert.equal(SEARCH_CITIES[0].name, "Bengaluru");
  assert.equal(searchCity(""), "Bengaluru");
  assert.equal(searchCity(undefined), "Bengaluru");
  assert.equal(searchCity("Mumbai"), "Bengaluru");
});

test("Mangaluru is searchable under its old spellings", () => {
  for (const v of ["Mangaluru", "mangalore", " MANGALURU ", "kudla", "MLR"]) assert.equal(searchCity(v), "Mangaluru");
  assert.equal(searchCity("bangalore"), "Bengaluru");
  assert.ok(isSearchCity("Mangaluru"));
  assert.ok(!isSearchCity("mangalore"));
});

test("Mangaluru includes Bunder with a real centroid", () => {
  const [lat, lng] = areaCentroid("Mangaluru", "Bunder", [0, 0]);
  assert.ok(lat > 12.8 && lat < 12.9 && lng > 74.8 && lng < 74.9);
  assert.deepEqual(areaCentroid("Mangaluru", "Nowhere", [1, 2]), [1, 2]);
});

test("SEO copy and sitemap paths cover each city", () => {
  assert.match(citySeoTitle("mangalore"), /Mangaluru/);
  assert.match(citySeoDescription("Mangaluru"), /Bunder/);
  assert.deepEqual(citySearchPaths(), ["/search?city=Bengaluru", "/search?city=Mangaluru"]);
});

test("budget hints match each city's bed prices", async () => {
  const { budgetHints } = await import("./cities.ts");
  assert.equal(budgetHints("Mangaluru").placeholder, "₹ up to 9,000");
  assert.equal(budgetHints("mangalore").chips[0][1], "6000");
  assert.ok(!budgetHints("Mangaluru").placeholder.includes("15,000"));
  assert.equal(budgetHints("Bengaluru").placeholder, "₹ up to 15,000");
});
