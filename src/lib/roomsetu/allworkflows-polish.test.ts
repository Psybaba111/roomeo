import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMING_SOON } from "./constants.ts";
import { policeFormLines } from "./movein.ts";
import { NOT_FOUND_COPY } from "../not-found-copy.ts";

test("Coming soon lists only features that aren't live, and never deposit holding", () => {
  const all = COMING_SOON.join(" | ").toLowerCase();
  for (const gone of ["agreement", "maintenance", "complaint", "deposit"]) assert.ok(!all.includes(gone), gone);
  assert.ok(COMING_SOON.length > 0);
});

test("mark-paid form doesn't mention AutoPay", () => {
  const src = readFileSync(new URL("../../components/complaints-receipts.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("outside AutoPay"));
  assert.ok(src.includes("Got rent? Mark it paid"));
});

test("squad screens don't print raw ISO move-in dates", () => {
  for (const f of ["squads.$id.tsx", "squads.index.tsx", "squads.join.$code.tsx"]) {
    const src = readFileSync(new URL(`../../routes/${f}`, import.meta.url), "utf8");
    assert.match(src, /move in \$\{readableDate\(/, f);
  }
});

test("branded 404 copy", () => {
  assert.equal(NOT_FOUND_COPY.eyebrow, "404");
  assert.equal(NOT_FOUND_COPY.primary.to, "/");
});

test("police form shows a readable date of birth", () => {
  const lines = policeFormLines({
    details: { fullName: "Asha", phone: "9845012345", email: "", dateOfBirth: "2001-03-09", occupation: "", employer: "", homeAddress: "", homeCity: "Bengaluru", homeState: "", homePincode: "", emergencyName: "", emergencyPhone: "", idType: "AADHAAR", idMasked: "XXXX XXXX 0123" },
    outsideMangaluru: true,
    owner: { name: "R", phone: "98", address: "Kadri" },
    propertyAddress: "Mud Home",
    startDate: "2026-11-01",
  }).map((l) => l.text).join("\n");
  assert.match(lines, /Date of birth: 9 Mar 2001/);
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(lines));
});
