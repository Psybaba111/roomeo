import test from "node:test";
import assert from "node:assert/strict";
import { dashboardPasses } from "./dashboard-passes.ts";
import { pricingConfig } from "./pricing.ts";

test("dashboard shows only the v2 passes at default prices", () => {
  const c = pricingConfig({});
  const list = dashboardPasses({ model: c.contactModel, weekly: c.passes.WEEKLY.priceInr, monthly: c.passes.MONTHLY.priceInr, squadPerMember: c.passes.SQUAD.priceInr, squadDays: c.passes.SQUAD.days });
  assert.deepEqual(list.map((p) => [p.code, p.price]), [["WEEKLY", 149], ["MONTHLY", 299], ["SQUAD", 99]]);
  assert.ok(list.every((p) => ![199, 499].includes(p.price)));
});

test("no passes when the pass model is off", () => {
  assert.deepEqual(dashboardPasses({ model: "PER_LISTING_FEE", weekly: 149, monthly: 299, squadPerMember: 99, squadDays: 14 }), []);
});
