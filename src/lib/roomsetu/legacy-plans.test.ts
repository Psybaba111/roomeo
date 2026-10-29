import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legacyPlanRejection } from "./legacy-plans.ts";

test("every legacy plan code is refused with 410", () => {
  for (const c of ["BASIC", "PRO", "PREMIUM", "anything", undefined]) {
    const r = legacyPlanRejection(c);
    assert.equal(r.status, 410);
    assert.match(r.message, /retired/);
  }
});

test("startCheckout refuses before touching payments", () => {
  const src = readFileSync(new URL("./account-api.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export const startCheckout"));
  const reject = body.indexOf("legacyPlanRejection(");
  const insert = body.indexOf("insert into payments");
  assert.ok(reject > 0 && insert > reject, "rejection must run before the insert");
  const ret = body.indexOf("return { ok: false as const, message: retired.message }");
  assert.ok(ret > reject && ret < insert);
});

test("pass, boost and fast-track checkouts are not routed through the legacy gate", () => {
  const src = readFileSync(new URL("./pricing-api.ts", import.meta.url), "utf8");
  assert.ok(!src.includes("legacyPlanRejection"));
  assert.ok(src.includes("export const startPassCheckout"));
});
