import { test } from "node:test";
import assert from "node:assert/strict";
import { avgFixHours, canMove, complaintsEnabled, fixTimeLabel, isMonth, monthPeriod, normalizePan, receiptLines, receiptNo, rupeesInWords } from "./complaints.ts";

test("complaints are OFF unless the flag is set", () => {
  assert.equal(complaintsEnabled({}), false);
  assert.equal(complaintsEnabled({ ROOMEO_COMPLAINTS_ENABLED: "on" }), true);
});

test("status moves: owner works it, tenant confirms or reopens", () => {
  assert.ok(canMove("owner", "OPEN", "IN_PROGRESS"));
  assert.ok(canMove("owner", "IN_PROGRESS", "FIXED"));
  assert.ok(!canMove("owner", "FIXED", "CLOSED"));
  assert.ok(canMove("tenant", "FIXED", "CLOSED"));
  assert.ok(canMove("tenant", "FIXED", "OPEN"));
  assert.ok(!canMove("tenant", "OPEN", "FIXED"));
});

test("average fix time", () => {
  assert.equal(avgFixHours([]), null);
  assert.equal(avgFixHours([{ created_at: "2026-11-01T00:00:00Z", fixed_at: "2026-11-01T04:00:00Z" }, { created_at: "2026-11-01T00:00:00Z", fixed_at: "2026-11-01T08:00:00Z" }, { created_at: "2026-11-01T00:00:00Z", fixed_at: null }]), 6);
  assert.equal(fixTimeLabel(6), "6 h");
  assert.equal(fixTimeLabel(72), "3 days");
});

test("rupees in words, Indian system", () => {
  assert.equal(rupeesInWords(8999), "Eight Thousand Nine Hundred Ninety Nine Rupees Only");
  assert.equal(rupeesInWords(125000), "One Lakh Twenty Five Thousand Rupees Only");
  assert.equal(rupeesInWords(10_000_000), "One Crore Rupees Only");
});

test("periods, months, PAN, receipt no", () => {
  assert.deepEqual(monthPeriod("2026-02"), { from: "2026-02-01", to: "2026-02-28", label: "February 2026" });
  assert.ok(isMonth("2026-11") && !isMonth("2026-13"));
  assert.equal(normalizePan(" abcde1234f "), "ABCDE1234F");
  assert.equal(normalizePan(""), "");
  assert.throws(() => normalizePan("ABC"));
  assert.equal(receiptNo("ab12cd34-0000", "2026-11"), "RR-202611-AB12CD");
});

test("receipt lines carry HRA fields", () => {
  const t = receiptLines({ receiptNo: "RR-1", month: "2026-11", amountInr: 8999, paidOn: "2026-11-03", method: "CASH", ref: "", tenantName: "Asha", landlordName: "Athiti", landlordPan: "", landlordAddress: "Kadri", propertyAddress: "Mud Home, Kadri", source: "manual" }).map((l) => l.text).join("\n");
  assert.match(t, /Received with thanks from Asha/);
  assert.match(t, /2026-11-01 to 2026-11-30/);
  assert.match(t, /Landlord signature/);
  assert.match(t, /PAN: Not provided/);
  assert.match(t, /revenue stamp/);
});
