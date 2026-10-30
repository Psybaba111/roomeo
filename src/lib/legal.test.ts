import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRIVACY, TERMS, OPERATOR, LEGAL_UPDATED, LEGAL_NOTE } from "./legal.ts";
import { pricingConfig, SUCCESS_FEE_INR } from "./roomsetu/pricing.ts";

const text = (s: { title: string; body: string[] }[]) => s.map((x) => x.title + "\n" + x.body.join("\n")).join("\n");
const P = text(PRIVACY), T = text(TERMS);

test("operator + dates", () => {
  assert.equal(LEGAL_UPDATED, "29 Oct 2026");
  assert.match(LEGAL_NOTE, /isn't a substitute/);
  for (const s of [P, T]) { assert.ok(s.includes(OPERATOR.gstin)); assert.ok(s.includes(OPERATOR.email)); assert.ok(s.includes("Mangaluru")); }
});

test("privacy covers required sections", () => {
  for (const k of ["Google", "name, email address and profile photo", "Listings", "Chats", "ID verification", "UTR", "IP address", "never sell", "Vercel", "Neon", "How long we keep", "Erasure", "DPDP Act, 2023", "Grievance Officer", "Cookies", "keep you signed in"]) assert.ok(P.includes(k), k);
});

test("terms fees match pricing defaults", () => {
  const c = pricingConfig({});
  assert.equal(c.successFeeEnabled, false);
  assert.equal(c.passesEnabled, false);
  assert.ok(T.includes("Owner chats are free"));
  assert.ok(T.includes("no success fee"));
  assert.ok(!T.includes(`₹${SUCCESS_FEE_INR}`));
  assert.ok(T.includes(`within ${c.noReplyHours} hours`));
  for (const k of ["not the owner, landlord", "within 7 days", "acceptable use", "Mangaluru, Karnataka", "Limitation of liability", "Indemnity", "Intermediary Rules, 2021", "broker"]) assert.ok(T.includes(k), k);
});

test("sitemap lists /privacy and /terms", () => {
  const s = readFileSync(new URL("../routes/sitemap[.]xml.ts", import.meta.url), "utf8");
  assert.match(s, /"\/privacy", "\/terms"/);
});
