import { test } from "node:test";
import assert from "node:assert/strict";
import { boardSummary, headcount, istDate, mealOpen, parseBed, pgOpsEnabled, relistFrom } from "./pg-ops.ts";

const ist = (s: string) => new Date(`${s}+05:30`);

test("pg ops OFF unless the flag is set", () => {
  assert.equal(pgOpsEnabled({}), false);
  assert.equal(pgOpsEnabled({ ROOMEO_PG_OPS_ENABLED: "1" }), true);
});

test("meal cutoff is 11 AM IST on the day", () => {
  assert.equal(mealOpen("2026-11-02", ist("2026-11-02T10:59:00")), true);
  assert.equal(mealOpen("2026-11-02", ist("2026-11-02T11:00:00")), false);
  assert.equal(mealOpen("2026-11-03", ist("2026-11-02T22:00:00")), true);
  assert.equal(mealOpen("2026-12-30", ist("2026-11-02T08:00:00")), false, "max 14 days ahead");
  assert.equal(istDate(new Date("2026-11-01T19:00:00Z")), "2026-11-02");
});

test("headcount = residents minus skips", () => {
  assert.deepEqual(headcount(10, [{ meal: "LUNCH" }, { meal: "LUNCH" }, { meal: "DINNER" }]), { LUNCH: 8, DINNER: 9 });
  assert.deepEqual(headcount(0, [{ meal: "LUNCH" }]), { LUNCH: 0, DINNER: 0 });
});

test("bed parsing clears tenant fields for vacant and needs notice end", () => {
  assert.throws(() => parseBed({ label: "B1", status: "ON_NOTICE" }), /notice end/);
  assert.deepEqual(parseBed({ label: "B1", status: "VACANT", tenantName: "x", moveInDate: "2026-01-01" }), { label: "B1", status: "VACANT", tenantName: "", moveInDate: null, noticeEnd: null, note: "" });
  assert.throws(() => parseBed({ label: "", status: "VACANT" }));
  assert.throws(() => parseBed({ label: "B1", status: "NOPE" }));
});

test("relist dates", () => {
  assert.equal(relistFrom({ status: "VACANT", notice_end: null }, "2026-11-02"), "2026-11-02");
  assert.equal(relistFrom({ status: "ON_NOTICE", notice_end: "2026-11-30" }, "2026-11-02"), "2026-12-01");
  assert.equal(relistFrom({ status: "ON_NOTICE", notice_end: "2026-10-01" }, "2026-11-02"), "2026-11-02");
  assert.equal(relistFrom({ status: "OCCUPIED", notice_end: null }, "2026-11-02"), null);
  assert.deepEqual(boardSummary([{ status: "OCCUPIED" }, { status: "VACANT" }, { status: "ON_NOTICE" }]), { total: 3, occupied: 1, vacant: 1, onNotice: 1, blocked: 0 });
});
