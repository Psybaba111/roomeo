import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { refundPolicyFor, termsFor } from "./legal.ts";
import { feeViewOf, feeLine, homeChatStep, pricingCopy } from "./roomsetu/fee-copy.ts";
import { pricingConfig } from "./roomsetu/pricing.ts";

const TRIAL = { feeInr: 99, windowDays: 14 };
const views = {
  off: feeViewOf(pricingConfig({})),
  on: feeViewOf(pricingConfig({ ROOMEO_FEE_ENABLED: "true" })),
  ownerAfterDeposit: feeViewOf(pricingConfig({ ROOMEO_FEE_ENABLED: "true" }), { OWNER_FEE_ENABLED: "true" }),
};

test("home copy says the same refund rule as Pricing and Terms (no bare 'refundable within 7 days')", () => {
  for (const [name, f] of Object.entries(views)) {
    for (const line of [feeLine(f), homeChatStep(f)]) {
      assert.doesNotMatch(line, /refundable within 7 days/, name);
      if (f.on && /refund/i.test(line)) assert.match(line, /only if (you|the renter) moves? out within 7 days of paying/, name);
    }
  }
  assert.match(feeLine(views.on), /Refunded only if you move out within 7 days of paying/);
  assert.match(pricingCopy(views.on, TRIAL).sub, /moves out within 7 days of paying/);
  assert.ok(termsFor(views.on).find((s) => s.id === "refunds")!.body.join(" ").includes("vacates within 7 days of paying"));
});

test("refund policy reuses the Terms refunds clause and the Pricing refund answers word for word", () => {
  for (const [name, f] of Object.entries(views)) {
    const faq = pricingCopy(f, TRIAL).faq;
    const rp = refundPolicyFor(f, faq);
    const rules = rp.find((s) => s.id === "rules")!.body;
    assert.deepEqual(rules, termsFor(f).find((s) => s.id === "refunds")!.body, name);
    const short = rp.find((s) => s.id === "short")!.body.join("\n");
    for (const [q, a] of faq.filter(([q]) => /refund/i.test(q))) assert.ok(short.includes(q) && short.includes(a), `${name}: ${q}`);
    assert.ok(rp.find((s) => s.id === "rent-deposit")!.body.length >= 1, name);
    assert.match(rp.find((s) => s.id === "help")!.body[0], /Grievance Officer/);
  }
});

test("/refund-policy route exists, is in the sitemap and linked from the footer", () => {
  assert.match(readFileSync(new URL("../routes/refund-policy.tsx", import.meta.url), "utf8"), /createFileRoute\("\/refund-policy"\)/);
  const sm = readFileSync(new URL("../routes/sitemap[.]xml.ts", import.meta.url), "utf8");
  assert.equal(sm.match(/"\/refund-policy"/g)?.length, 2);
  assert.match(readFileSync(new URL("../components/shell.tsx", import.meta.url), "utf8"), /to="\/refund-policy"/);
});
