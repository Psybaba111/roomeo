import { test } from "node:test";
import assert from "node:assert/strict";
import { agreementText, depositBalance, depositStatusLabel, idLast4, isFromMangaluru, maskId, moveInEnabled, parseDetails, parseIdImage, policeFormLines, refundDueOn } from "./movein.ts";

test("move-in is OFF unless the flag is set", () => {
  assert.equal(moveInEnabled({}), false);
  assert.equal(moveInEnabled({ ROOMEO_MOVEIN_ENABLED: "false" }), false);
  assert.equal(moveInEnabled({ ROOMEO_MOVEIN_ENABLED: "true" }), true);
});

test("ID numbers: only last 4 kept, masked for display", () => {
  assert.equal(idLast4("AADHAAR", "2345 6789 0123"), "0123");
  assert.throws(() => idLast4("AADHAAR", "1234 5678 9012"));
  assert.throws(() => idLast4("AADHAAR", "23456"));
  assert.equal(idLast4("OFFICE_ID", "emp-00981"), "0981");
  assert.equal(maskId("AADHAAR", "0123"), "XXXX XXXX 0123");
  assert.equal(maskId("OFFICE_ID", "0981"), "XXXX0981");
});

test("Mangaluru vs outside residents", () => {
  assert.equal(isFromMangaluru("Mangalore", "000000"), true);
  assert.equal(isFromMangaluru("Kudla", ""), true);
  assert.equal(isFromMangaluru("Somewhere", "575003"), true);
  assert.equal(isFromMangaluru("Udupi", "576101"), false);
  assert.equal(isFromMangaluru("Bengaluru", "560001"), false);
});

test("details parse validates and drops the full ID number", () => {
  const d = parseDetails({ fullName: " Asha K ", phone: "+91 98450 12345", homeAddress: "12 MG Road, Indiranagar", homeCity: "Bengaluru", homeState: "Karnataka", homePincode: "560038", idType: "AADHAAR", idNumber: "2345 6789 0123" });
  assert.equal(d.fullName, "Asha K");
  assert.equal(d.phone, "9845012345");
  assert.equal(d.idLast4, "0123");
  assert.ok(!JSON.stringify(d).includes("23456789"));
  assert.throws(() => parseDetails({ fullName: "A" }));
  assert.throws(() => parseDetails({ fullName: "Asha", phone: "9845012345", homeAddress: "12 MG Road, x", homeCity: "B", homeState: "K", homePincode: "5600", idType: "AADHAAR", idNumber: "234567890123" }), /Pincode/);
});

test("ID image must be an image data URL", () => {
  assert.deepEqual(parseIdImage("data:image/jpeg;base64,AAAA"), { mime: "image/jpeg", base64: "AAAA" });
  assert.throws(() => parseIdImage("https://example.com/a.jpg"));
  assert.throws(() => parseIdImage("data:text/html;base64,AAAA"));
});

test("agreement carries rent, deposit, 3-month min stay, 30-day notice and rules", () => {
  const t = agreementText({ ownerName: "Athiti", tenantName: "Asha", propertyTitle: "Mud Home", propertyAddress: "Kadri", bedLabel: "B2", rentInr: 8999, depositInr: 8999, startDate: "2026-11-01", madeOn: "2026-10-30", minStayMonths: 3, noticeDays: 30, houseRules: "No smoking\nGate 11 PM" }).join("\n");
  assert.match(t, /LEAVE AND LICENCE/);
  assert.match(t, /₹8,999 per month/);
  assert.match(t, /Minimum stay is 3 months/);
  assert.match(t, /30 days' written notice/);
  assert.match(t, /1\. No smoking/);
  assert.match(t, /bed B2/);
  assert.match(t, /This agreement is made on 30 Oct 2026 between/, "made on = signing date, not move-in date");
  assert.match(t, /The licence starts on 1 Nov 2026\./);
  assert.doesNotMatch(t, /\d{4}-\d{2}-\d{2}/, "no raw ISO dates");
});

test("police form flags outside residents and masks the ID", () => {
  const lines = policeFormLines({
    details: { fullName: "Asha", phone: "9845012345", email: "", dateOfBirth: null, occupation: "", employer: "Infosys", homeAddress: "12 MG Road", homeCity: "Bengaluru", homeState: "Karnataka", homePincode: "560038", emergencyName: "", emergencyPhone: "", idType: "AADHAAR", idMasked: "XXXX XXXX 0123" },
    outsideMangaluru: true,
    owner: { name: "Rohith", phone: "98", address: "Kadri" },
    propertyAddress: "Mud Home, Kadri",
    startDate: "2026-11-01",
  }).map((l) => l.text).join("\n");
  assert.match(t(lines), /YES - home town police clearance required/);
  assert.match(lines, /XXXX XXXX 0123/);
  assert.match(lines, /Owner signature/);
  function t(s: string) { return s; }
});

test("deposit: refund due 7 days after checkout, balance after deductions", () => {
  assert.equal(refundDueOn("2026-12-28"), "2027-01-04");
  assert.equal(depositBalance(8999, [{ amount_inr: 500 }, { amount_inr: 1000 }]), 7499);
  assert.equal(depositBalance(500, [{ amount_inr: 900 }]), 0);
  assert.equal(depositStatusLabel({ status: "REFUND_DUE", refund_due_on: "2026-11-01" }, "2026-11-02"), "Refund overdue ⚠️");
  assert.equal(depositStatusLabel({ status: "REFUND_DUE", refund_due_on: "2026-11-05" }, "2026-11-02"), "Refund due by 2026-11-05");
});
