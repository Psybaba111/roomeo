import { test } from "node:test";
import assert from "node:assert/strict";
import { istToday, nextDueMonth, readableDate } from "./dates.ts";

test("readableDate: ISO date → '30 Oct 2026'", () => {
  assert.equal(readableDate("2026-10-30"), "30 Oct 2026");
  assert.equal(readableDate("2026-11-01"), "1 Nov 2026");
  assert.equal(readableDate(null), "");
  assert.equal(readableDate(""), "");
  assert.equal(readableDate("not a date"), "not a date");
});
test("readableDate: timestamps are read in IST", () => {
  assert.equal(readableDate("2026-10-30T19:00:00Z"), "31 Oct 2026");
  assert.equal(readableDate("2026-10-30T12:00:00Z"), "30 Oct 2026");
});
test("istToday rolls over at IST midnight", () => {
  assert.equal(istToday(new Date("2026-10-30T18:29:00Z")), "2026-10-30");
  assert.equal(istToday(new Date("2026-10-30T18:31:00Z")), "2026-10-31");
});
test("nextDueMonth: first unpaid month from tenancy start", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  assert.equal(nextDueMonth("2026-11-01", [], now), "2026-11");
  assert.equal(nextDueMonth("2026-11-01", ["2026-11"], now), "2026-12");
  assert.equal(nextDueMonth("2026-11-15", ["2026-11", "2026-12"], now), "2027-01");
  assert.equal(nextDueMonth("2026-06-01", ["2026-06", "2026-08"], now), "2026-07", "fills gaps first");
  assert.equal(nextDueMonth(null, [], now), "2026-10", "no start → current IST month");
});
