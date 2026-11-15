/**
 * "Fee OFF ⇒ no fee anywhere" (code review, 14 Nov 2026). With ROOMEO_FEE_ENABLED unset, no
 * user-facing copy, legal text, agreement or quote may show or charge ₹499 / ₹589. With the fee
 * switched on, the same builders show the configured amounts.
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pricingConfig } from "./pricing.ts";
import {
  FEE_OFF,
  asFeeView,
  cityFeeTail,
  feeLine,
  feeUnderPrice,
  feeViewOf,
  homeChatStep,
  inviteBody,
  inviteDescription,
  lockedLocationLine,
  mentionsFeeAmount,
  ogFeeLabel,
  pricingCopy,
  pricingTrialCreditBullet,
  rentPartnerMissingLine,
  trialCreditLine,
} from "./fee-copy.ts";
import { termsFor, TERMS } from "../legal.ts";
import { citySeoDescription } from "./cities.ts";
import { rentQuote } from "./money.ts";
import { agreementBody, agreementFeeBaseInr } from "./deal-agreement.ts";
import { trialArrivalChecklist, TRIAL_ARRIVAL_CHECKLIST } from "./trial-nights.ts";
import { dealWaiting } from "./owner-inbox.ts";

const TRIAL = { feeInr: 99, windowDays: 14 };
const offCfg = pricingConfig({});
const onCfg = pricingConfig({ ROOMEO_FEE_ENABLED: "true" });
const OFF = feeViewOf(offCfg);
const ON = feeViewOf(onCfg);
const terms = { listingTitle: "AC 2-sharing", address: "MPT Rd", city: "Mangaluru", locality: "Bunder", monthlyRent: 8999, deposit: 8999, moveIn: "2026-11-01", tenantName: "T", ownerName: "O" };

function allCopy(f: typeof OFF): string[] {
  const p = pricingCopy(f, TRIAL);
  return [
    feeLine(f),
    homeChatStep(f),
    feeUnderPrice(f),
    lockedLocationLine(f),
    cityFeeTail(f),
    citySeoDescription("Mangaluru", f),
    inviteDescription(f),
    inviteBody(f),
    ogFeeLabel(f).priceLabel,
    ogFeeLabel(f).priceNote,
    rentPartnerMissingLine(f),
    trialCreditLine(f, 99, 14) ?? "",
    pricingTrialCreditBullet(f, 99, 14) ?? "",
    p.headTitle,
    p.h1,
    p.sub,
    p.planPrice,
    p.planNote,
    ...p.tagline,
    ...p.faq.flat(),
    ...termsFor(f).flatMap((s) => [s.title, ...s.body]),
    ...trialArrivalChecklist(f),
    agreementBody({ ...terms, feeBaseInr: agreementFeeBaseInr(f.on ? onCfg : offCfg) }),
  ];
}

describe("fee setting", () => {
  test("default config keeps the fee OFF", () => {
    assert.equal(offCfg.successFeeEnabled, false);
    assert.deepEqual(OFF, FEE_OFF);
    assert.deepEqual(ON, { on: true, baseInr: 499, totalInr: 589 });
  });
  test("asFeeView fails safe to OFF for missing or malformed loader data", () => {
    for (const v of [undefined, null, {}, { on: "true" }, { on: true, baseInr: 0 }, { on: false, baseInr: 499, totalInr: 589 }]) assert.deepEqual(asFeeView(v), FEE_OFF, JSON.stringify(v));
    assert.deepEqual(asFeeView(ON), ON);
    assert.deepEqual(asFeeView({ on: true, baseInr: 499 }), ON);
  });
});

describe("fee OFF ⇒ no ₹499 / ₹589 anywhere", () => {
  test("every copy builder, the terms, the trial checklist and the agreement", () => {
    for (const line of allCopy(OFF)) assert.equal(mentionsFeeAmount(line), false, line);
    assert.ok(TERMS.every((s) => s.body.every((b) => !mentionsFeeAmount(b))));
    assert.ok(TRIAL_ARRIVAL_CHECKLIST.every((c) => !mentionsFeeAmount(c)));
  });
  test("copy says it is free for tenants (owner-fee model, 15 Nov 2026)", () => {
    assert.match(feeLine(OFF), /free for tenants/i);
    assert.match(pricingCopy(OFF, TRIAL).h1, /free for tenants/i);
    assert.equal(trialCreditLine(OFF, 99, 14), null);
    assert.equal(pricingTrialCreditBullet(OFF, 99, 14), null);
  });
  test("terms keep the no-cut and deposit promises but drop the fee and fee-refund amounts", () => {
    const t = termsFor(OFF).flatMap((s) => s.body).join("\n");
    assert.match(t, /no platform fee to renters or owners while we pilot/);
    assert.match(t, /never takes a cut of rent or deposit/);
    assert.match(t, /Deposits are paid directly to the owner/);
    assert.doesNotMatch(t, /vacates within 7 days of paying/);
  });
  test("deal agreement has no success-fee clauses and is renumbered", () => {
    const body = agreementBody({ ...terms, feeBaseInr: agreementFeeBaseInr(offCfg) });
    assert.equal(agreementFeeBaseInr(offCfg), 0);
    assert.doesNotMatch(body, /success fee|GST|refunded/i);
    assert.match(body, /^1\. The tenant takes the room/m);
    assert.match(body, /^2\. House rules/m);
    assert.match(body, /^3\. This agreement is signed/m);
    assert.doesNotMatch(body, /^4\./m);
  });
  test("rent quotes and the owner inbox add no fee", () => {
    const q = rentQuote(8999, 8999, true, offCfg.successFeeEnabled, offCfg.successFeeTenantInr);
    assert.deepEqual([q.seekerFee, q.hostFee, q.seekerPays, q.hostReceives], [0, 0, 8999, 8999]);
    assert.equal(dealWaiting({ issued: true, cancelled: false, ownerSigned: true, seekerSigned: true, feeStatus: "" }, OFF), null);
  });
});

describe("fee ON ⇒ amounts come from the setting", () => {
  test("copy shows ₹499 + GST = ₹589", () => {
    assert.match(feeLine(ON), /₹589 \(₹499 \+ GST\)/);
    assert.match(feeUnderPrice(ON), /^₹589 one-time Roomeo fee/);
    assert.match(lockedLocationLine(ON), /₹589 paid/);
    assert.match(citySeoDescription("Mangaluru", ON), /₹589 once/);
    assert.match(pricingCopy(ON, TRIAL).h1, /^₹499 once/);
    assert.match(pricingTrialCreditBullet(ON, 99, 14) ?? "", /so you pay ₹490/);
    assert.equal(ogFeeLabel(ON).priceLabel, "₹499 once");
    assert.ok(trialArrivalChecklist(ON).some((c) => c.includes("₹589 fee")));
  });
  test("terms carry the fee and the 7-day refund rule", () => {
    const t = termsFor(ON).flatMap((s) => s.body).join("\n");
    assert.ok(t.includes("₹499 plus 18% GST (₹589 in total), once"));
    assert.match(t, /vacates within 7 days of paying/);
  });
  test("deal agreement keeps clauses 2-3 with the fee", () => {
    const body = agreementBody({ ...terms, feeBaseInr: agreementFeeBaseInr(onCfg) });
    assert.match(body, /^2\. Both sides pay Roomeo a one-time platform success fee of ₹499 \+ ₹89\.82 GST/m);
    assert.match(body, /^3\. Roomeo's fee is refunded only if/m);
    assert.match(body, /^5\. This agreement is signed/m);
  });
  test("rent quote adds the configured fee on the first month only", () => {
    const q = rentQuote(8999, 8999, true, onCfg.successFeeEnabled, onCfg.successFeeTenantInr);
    assert.deepEqual([q.seekerFee, q.seekerPays, q.hostReceives], [499, 9498, 8500]);
    assert.equal(rentQuote(8999, 8999, false, true, 499).seekerFee, 0);
  });
});

describe("no hard-coded fee amounts left in the fee-off surfaces", () => {
  const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  for (const file of [
    "routes/index.tsx",
    "routes/pricing.tsx",
    "routes/r.$code.tsx",
    "routes/listing.$id.tsx",
    "routes/terms.tsx",
    "routes/api/og/listing.$id.ts",
    "lib/legal.ts",
    "lib/roomsetu/money.ts",
    "lib/roomsetu/booking-cta.ts",
    "lib/roomsetu/location-gate.ts",
    "lib/roomsetu/cities.ts",
    "lib/roomsetu/trial-nights.ts",
    "lib/roomsetu/owner-inbox.ts",
    "lib/roomsetu/trust-api.ts",
  ]) {
    test(file, () => assert.equal(mentionsFeeAmount(src(file)), false));
  }
});
