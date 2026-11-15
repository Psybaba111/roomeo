// Owner-fee model (Rohith, 15 Nov 2026): amounts, rounding, attribution window, founding rate, refund, GST, settings.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  attributed,
  commissionAmounts,
  commissionDueOn,
  commissionInr,
  defaultFoundingUntil,
  ownerFeeAgreementClause,
  ownerFeeState,
  paymentLinkStub,
  rateFor,
  refundEligible,
  refundInr,
  canMarkPaid,
  canRefund50,
} from "./owner-fee.ts";
import { pricingConfig, tenantFeeSetting } from "./pricing.ts";
import { feeViewOf, feeLine, feeUnderPrice, homeChatStep, pricingCopy, cityFeeTail, inviteBody, inviteDescription, ogFeeLabel, rentPartnerMissingLine, mentionsFeeAmount, asFeeView, FREE_TENANTS } from "./fee-copy.ts";
import { termsFor, termsUpdated, LEGAL_UPDATED, OWNER_FEE_TERMS_UPDATED } from "../legal.ts";
import { agreementBody, agreementFeeBaseInr } from "./deal-agreement.ts";

describe("commission amounts (nearest rupee, halves up)", () => {
  test("20% of one month's rent", () => {
    assert.equal(commissionInr(5999, 20), 1200); // 1,199.80
    assert.equal(commissionInr(6999, 20), 1400); // 1,399.80
    assert.equal(commissionInr(7999, 20), 1600); // 1,599.80
    assert.equal(commissionInr(8999, 20), 1800); // 1,799.80
  });
  test("15% founding rate uses the same rule", () => {
    assert.equal(commissionInr(5999, 15), 900); // 899.85
    assert.equal(commissionInr(8999, 15), 1350); // 1,349.85
  });
  test("exact halves round up, below-half rounds down", () => {
    assert.equal(commissionInr(10, 15), 2); // 1.5 → 2
    assert.equal(commissionInr(2, 20), 0); // 0.4 → 0
    assert.equal(commissionInr(12, 20), 2); // 2.4 → 2
    assert.equal(commissionInr(13, 20), 3); // 2.6 → 3
  });
  test("rejects bad input", () => {
    assert.throws(() => commissionInr(0, 20));
    assert.throws(() => commissionInr(5999.5, 20));
    assert.throws(() => commissionInr(5999, 0));
  });
  test("GST is a separate line on the rounded commission", () => {
    assert.deepEqual(commissionAmounts(5999, 20), { rentInr: 5999, ratePct: 20, feeInr: 1200, gstPct: 18, gstInr: 216, totalInr: 1416 });
    assert.deepEqual(commissionAmounts(5999, 15), { rentInr: 5999, ratePct: 15, feeInr: 900, gstPct: 18, gstInr: 162, totalInr: 1062 });
    assert.equal(commissionAmounts(8999, 20).gstInr, 324);
    assert.equal(commissionAmounts(5999, 20, 0).totalInr, 1200);
  });
});

describe("attribution: within 60 days of the first enquiry to that host", () => {
  const enquiry = "2026-09-01T10:00:00+05:30";
  test("day 59 and day 60 count, day 61 doesn't", () => {
    assert.deepEqual(attributed(enquiry, "2026-10-30"), { ok: true, days: 59 });
    assert.deepEqual(attributed(enquiry, "2026-10-31"), { ok: true, days: 60 });
    assert.deepEqual(attributed(enquiry, "2026-11-01"), { ok: false, days: 61 });
  });
  test("same day counts (day 0); a move-in before the enquiry or no enquiry doesn't", () => {
    assert.equal(attributed(enquiry, "2026-09-01").ok, true);
    assert.equal(attributed(enquiry, "2026-08-31").ok, false);
    assert.deepEqual(attributed(null, "2026-09-01"), { ok: false, days: null });
  });
  test("days are India calendar dates: 11:50 PM IST enquiry is that IST day", () => {
    // 18:20 UTC on 1 Sep = 11:50 PM IST on 1 Sep. 60 days later = 31 Oct.
    assert.equal(attributed("2026-09-01T18:20:00Z", "2026-10-31").ok, true);
    // 18:40 UTC on 1 Sep = 12:10 AM IST on 2 Sep → 31 Oct is day 59, 1 Nov is day 60.
    assert.deepEqual(attributed("2026-09-01T18:40:00Z", "2026-11-01"), { ok: true, days: 60 });
    assert.equal(attributed("2026-09-01T18:40:00Z", "2026-11-02").ok, false);
  });
});

describe("founding partner rate (admin-set, with an end date)", () => {
  test("15% up to and including the end date, 20% after", () => {
    const host = { foundingPartner: true, foundingUntil: "2027-05-15" };
    assert.deepEqual(rateFor(host, "2027-05-15"), { ratePct: 15, founding: true });
    assert.deepEqual(rateFor(host, "2027-05-16"), { ratePct: 20, founding: false });
  });
  test("not founding, cleared, or no end date → 20%", () => {
    assert.equal(rateFor(null, "2026-12-01").ratePct, 20);
    assert.equal(rateFor({ foundingPartner: false, foundingUntil: "2027-05-15" }, "2026-12-01").ratePct, 20);
    assert.equal(rateFor({ foundingPartner: true, foundingUntil: null }, "2026-12-01").ratePct, 20);
  });
  test("default end date is 6 months on, clamped to month end", () => {
    assert.equal(defaultFoundingUntil("2026-11-15"), "2027-05-15");
    assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
    assert.equal(addMonths("2027-08-31", 6), "2028-02-29");
  });
});

describe("due date, refund, status moves", () => {
  test("due 7 days after the move-in (deposit / first rent)", () => {
    assert.equal(commissionDueOn("2026-11-15"), "2026-11-22");
    assert.equal(commissionDueOn("2026-12-28"), "2027-01-04");
  });
  test("50% back if the tenant leaves within 15 days of moving in", () => {
    assert.equal(refundEligible("2026-11-01", "2026-11-16"), true); // day 15
    assert.equal(refundEligible("2026-11-01", "2026-11-17"), false); // day 16
    assert.equal(refundEligible("2026-11-01", "2026-11-01"), true);
    assert.equal(refundInr(1416), 708);
    assert.equal(refundInr(1062), 531);
    assert.equal(refundInr(1001), 501); // 500.5 → 501
  });
  test("due → paid → refunded_50 only", () => {
    assert.equal(canMarkPaid("due"), true);
    assert.equal(canMarkPaid("paid"), false);
    assert.equal(canRefund50("paid"), true);
    assert.equal(canRefund50("due"), false);
    assert.equal(canRefund50("refunded_50"), false);
  });
  test("payment link is a stub (no Razorpay call)", () => {
    const l = paymentLinkStub("1234abcd-ef56-7890");
    assert.equal(l.mode, "stub");
    assert.equal(l.url, null);
    assert.match(l.ref, /^stub_plink_/);
  });
});

describe("settings: tenant fee and owner fee flags", () => {
  test("code defaults: tenant fee OFF, owner fee OFF", () => {
    assert.deepEqual(tenantFeeSetting({}), { enabled: false, source: "default" });
    assert.equal(pricingConfig({}).successFeeEnabled, false);
    assert.deepEqual(ownerFeeState(false, {}), { flag: false, active: false, blockedByTenantFee: false });
  });
  test("production today (ROOMEO_FEE_ENABLED on, nothing new set) → tenant fee stays ON after merge", () => {
    const prod = { ROOMEO_FEE_ENABLED: "true" };
    assert.deepEqual(tenantFeeSetting(prod), { enabled: true, source: "ROOMEO_FEE_ENABLED" });
    assert.equal(pricingConfig(prod).successFeeEnabled, true);
    assert.equal(feeViewOf(pricingConfig(prod), prod).on, true);
    assert.equal(feeViewOf(pricingConfig(prod), prod).totalInr, 589);
  });
  test("ROOMEO_TENANT_FEE_ENABLED wins over the legacy flag either way", () => {
    assert.equal(tenantFeeSetting({ ROOMEO_FEE_ENABLED: "true", ROOMEO_TENANT_FEE_ENABLED: "false" }).enabled, false);
    assert.equal(tenantFeeSetting({ ROOMEO_FEE_ENABLED: "false", ROOMEO_TENANT_FEE_ENABLED: "true" }).enabled, true);
    assert.equal(tenantFeeSetting({ ROOMEO_TENANT_FEE_ENABLED: "false" }).source, "ROOMEO_TENANT_FEE_ENABLED");
  });
  test("owner fee is only active while the tenant success fee is off (never both)", () => {
    assert.deepEqual(ownerFeeState(true, { OWNER_FEE_ENABLED: "true" }), { flag: true, active: false, blockedByTenantFee: true });
    assert.deepEqual(ownerFeeState(false, { OWNER_FEE_ENABLED: "true" }), { flag: true, active: true, blockedByTenantFee: false });
  });
});

describe("tenant never sees a Roomeo fee while the tenant fee is off", () => {
  const env = { ROOMEO_FEE_ENABLED: "true", ROOMEO_TENANT_FEE_ENABLED: "false", OWNER_FEE_ENABLED: "true" };
  const f = feeViewOf(pricingConfig(env), env);
  const TRIAL = { feeInr: 99, windowDays: 14 };
  test("fee view: tenant off, owner on", () => {
    assert.equal(f.on, false);
    assert.equal(f.owner?.on, true);
    assert.equal(asFeeView(JSON.parse(JSON.stringify(f))).owner?.on, true);
  });
  test("every tenant-facing line says Free for tenants and has no ₹ fee amount", () => {
    const lines = [feeLine(f), feeUnderPrice(f), cityFeeTail(f), inviteBody(f), inviteDescription(f), ogFeeLabel(f).priceLabel, rentPartnerMissingLine(f)];
    for (const l of lines) {
      assert.match(l, /free for tenants/i, l);
      assert.doesNotMatch(l, /₹\s?\d/, l);
    }
    assert.match(homeChatStep(f), /Free for tenants/);
    const p = pricingCopy(f, TRIAL);
    assert.equal(p.h1, `${FREE_TENANTS}. Not a broker's month.`);
    assert.equal(p.planPrice, "₹0");
    assert.ok(p.faq.some(([q]) => /brokerage/i.test(q)));
    assert.ok(![p.h1, p.sub, p.planNote, ...p.tagline].some((t) => mentionsFeeAmount(t)));
  });
  test("terms: owner commission, refund, no-brokerage; own date; nothing to tenants", () => {
    const t = termsFor(f).flatMap((s) => s.body).join("\n");
    assert.match(t, /Free for tenants: renters pay Roomeo nothing/);
    assert.match(t, /20% of one month's rent/);
    assert.match(t, /15% instead of 20% for 6 months/);
    assert.match(t, /day 60 counts, day 61 doesn't/);
    assert.match(t, /within 7 days of the tenant paying the deposit or first rent/);
    assert.match(t, /refunds 50% of the commission/);
    assert.match(t, /must not charge a Roomeo tenant any brokerage/);
    assert.doesNotMatch(t, /we take no commission/);
    assert.equal(mentionsFeeAmount(t), false);
    assert.equal(termsUpdated(f), OWNER_FEE_TERMS_UPDATED);
  });
  test("terms date unchanged unless the owner-fee copy is live", () => {
    const prod = { ROOMEO_FEE_ENABLED: "true", OWNER_FEE_ENABLED: "true" };
    assert.equal(termsUpdated(feeViewOf(pricingConfig(prod), prod)), LEGAL_UPDATED);
    assert.equal(termsUpdated(feeViewOf(pricingConfig({}), {})), LEGAL_UPDATED);
  });
  test("agreement: no tenant fee clause, owner commission clause with the amount and no-brokerage", () => {
    const cfg = pricingConfig(env);
    const body = agreementBody({ listingTitle: "Mud Home", address: "62 MPT Road", city: "Mangaluru", locality: "Bunder", monthlyRent: 5999, deposit: 5999, moveIn: "2026-11-20",
      tenantName: "ZZ TEST Tenant", ownerName: "ZZ TEST Owner", feeBaseInr: agreementFeeBaseInr(cfg), ownerFeePct: 20 });
    assert.equal(agreementFeeBaseInr(cfg), 0);
    assert.match(body, /Roomeo is free for the tenant/);
    assert.match(body, /20% of one month's rent \(₹1200\) plus GST/);
    assert.match(body, /will not charge the tenant any brokerage/);
    assert.doesNotMatch(body, /₹(499|589)/);
    assert.match(ownerFeeAgreementClause(15, 5999), /₹900/);
  });
});

test("deal steps: tenant sees Free for tenants; owner sees the commission is due after move-in", async () => {
  const { dealSteps } = await import("./deal-steps.ts");
  const base = { iSigned: true, issued: true, cancelled: false, feeOn: false, feePaid: false, feeTotal: 0, movedIn: false };
  const tenant = dealSteps({ ...base, role: "tenant" }).find((s) => s.key === "pay")!;
  assert.match(tenant.hint, /Free for tenants/);
  assert.doesNotMatch(tenant.hint, /₹/);
  const owner = dealSteps({ ...base, role: "owner", ownerFeeTotal: 1416 }).find((s) => s.key === "pay")!;
  assert.match(owner.hint, /₹1416 incl\. GST\) is due within 7 days of move-in/);
  assert.equal(dealSteps({ ...base, role: "owner" }).find((s) => s.key === "pay")!.hint, "No fee right now. Skip ahead 🙌");
});
