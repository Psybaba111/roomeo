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
  canRecordEarlyExit,
  earlyExitDueInr,
  ownerFeeGstPct,
  ownerFeeView,
  ownerFeeForViewer,
  ownerCommissionNote,
  commissionLine,
  squadBedRentInr,
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
  test("GST off (default): commission only, ₹1,200 on ₹5,999, no GST line", () => {
    assert.deepEqual(commissionAmounts(5999, 20), { rentInr: 5999, ratePct: 20, feeInr: 1200, gstPct: 0, gstInr: 0, totalInr: 1200 });
    assert.equal(commissionLine({ ...commissionAmounts(5999, 20), founding: false }), "20% of ₹5999 rent = ₹1200");
    assert.doesNotMatch(commissionLine({ ...commissionAmounts(5999, 20), founding: false }), /GST/);
  });
  test("GST on: 18% as a separate line on the rounded commission", () => {
    assert.deepEqual(commissionAmounts(5999, 20, 18), { rentInr: 5999, ratePct: 20, feeInr: 1200, gstPct: 18, gstInr: 216, totalInr: 1416 });
    assert.deepEqual(commissionAmounts(5999, 15, 18), { rentInr: 5999, ratePct: 15, feeInr: 900, gstPct: 18, gstInr: 162, totalInr: 1062 });
    assert.equal(commissionAmounts(8999, 20, 18).gstInr, 324);
    assert.match(commissionLine({ ...commissionAmounts(5999, 20, 18), founding: false }), /\+ ₹216 GST \(18%\) = ₹1416/);
  });
  test("OWNER_FEE_GST_ENABLED: default off; on → 18%", () => {
    assert.equal(ownerFeeGstPct({}), 0);
    assert.equal(ownerFeeGstPct({ OWNER_FEE_GST_ENABLED: "false" }), 0);
    assert.equal(ownerFeeGstPct({ OWNER_FEE_GST_ENABLED: "true" }), 18);
    assert.equal(ownerFeeView(true).gstPct, 0);
    assert.equal(ownerFeeView(true, 18).gstPct, 18);
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
  });
  test("refund after payment = 50% of the commission + 50% of any GST", () => {
    assert.equal(refundInr(1200), 600); // GST off
    assert.equal(refundInr(1200, 0), 600);
    assert.equal(refundInr(1200, 216), 708); // GST on: 600 + 108
    assert.equal(refundInr(900), 450); // founding, GST off
    assert.equal(refundInr(900, 162), 531); // founding, GST on: 450 + 81
    assert.equal(refundInr(1001), 501); // 500.5 → 501
  });
  test("early exit before payment: the owner owes 50%", () => {
    assert.equal(earlyExitDueInr(1200), 600);
    assert.equal(earlyExitDueInr(1200, 216), 708);
    assert.equal(earlyExitDueInr(900), 450);
    assert.equal(earlyExitDueInr(1001), 501);
  });
  test("status moves: due → due_50 (early exit) → paid; due → paid → refunded_50", () => {
    assert.equal(canMarkPaid("due"), true);
    assert.equal(canMarkPaid("due_50"), true);
    assert.equal(canMarkPaid("paid"), false);
    assert.equal(canRecordEarlyExit("due"), true);
    assert.equal(canRecordEarlyExit("due_50"), false);
    assert.equal(canRecordEarlyExit("paid"), false);
    assert.equal(canRefund50("paid"), true);
    assert.equal(canRefund50("paid", true), false, "already halved by an early exit");
    assert.equal(canRefund50("due"), false);
    assert.equal(canRefund50("due_50"), false);
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
    assert.equal(feeViewOf(pricingConfig(prod), prod).totalInr, 499, "₹499 all-in from 17 Nov 2026 (was ₹589)");
  });
  test("ROOMEO_TENANT_FEE_ENABLED wins over the legacy flag either way", () => {
    assert.equal(tenantFeeSetting({ ROOMEO_FEE_ENABLED: "true", ROOMEO_TENANT_FEE_ENABLED: "false" }).enabled, false);
    assert.equal(tenantFeeSetting({ ROOMEO_FEE_ENABLED: "false", ROOMEO_TENANT_FEE_ENABLED: "true" }).enabled, true);
    assert.equal(tenantFeeSetting({ ROOMEO_TENANT_FEE_ENABLED: "false" }).source, "ROOMEO_TENANT_FEE_ENABLED");
  });
  test("owner fee follows OWNER_FEE_ENABLED alone (it's charged after the deposit mark, so it can run alongside the tenant fee)", () => {
    assert.deepEqual(ownerFeeState(true, { OWNER_FEE_ENABLED: "true" }), { flag: true, active: true, blockedByTenantFee: false });
    assert.deepEqual(ownerFeeState(true, {}), { flag: false, active: false, blockedByTenantFee: false });
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
    assert.ok(![p.h1, p.planNote, ...p.tagline].some((t) => mentionsFeeAmount(t)));
    assert.match(p.sub, /^Tenants pay Roomeo nothing\. Owners pay a flat ₹499, GST included/, "the only amount is the owner's");
  });
  test("terms: owner commission, refund, no-brokerage; own date; nothing to tenants", () => {
    const t = termsFor(f).flatMap((s) => s.body).join("\n");
    assert.match(t, /Free for tenants: renters pay Roomeo nothing/);
    assert.match(t, /flat fee of ₹499 for each tenant who comes through Roomeo.*charged only after the owner has received that tenant's deposit and rent advance, marked it on Roomeo, and Roomeo has checked that mark\. Nothing is charged at listing time or upfront\./);
    assert.doesNotMatch(t, /20% of one month's rent|15% instead of 20%/);
    assert.match(t, /Founding partners, as confirmed by Roomeo in writing, pay ₹0.*no invoice is issued for a ₹0 fee.*every later move-in is the flat ₹499\./);
    assert.match(t, /day 60 counts, day 61 doesn't/);
    assert.match(t, /due within 7 days of Roomeo checking the mark.*Roomeo may decline a mark it can't verify.*the mark can be undone and nothing is owed/);
    assert.doesNotMatch(t, /i\.e\. each bed/, "squads carry no owner fee under the deposit model (accepted gap)");
    assert.match(t, /No GST is charged on it at present/);
    assert.match(t, /If the commission isn't paid yet, only 50% is due/);
    assert.match(t, /refunds 50% of the commission\./);
    assert.match(t, /The tenant never sees or pays the owner's fee/);
    assert.match(t, /Referral credits.*aren't cash/);
    assert.match(t, /must not charge a Roomeo tenant any brokerage/);
    assert.doesNotMatch(t, /we take no commission/);
    assert.doesNotMatch(t, /(renter|tenant)s? pays? (Roomeo )?₹/i, "the only ₹ amount in the terms is the owner's flat fee");
    assert.equal(termsUpdated(f), OWNER_FEE_TERMS_UPDATED);
  });
  test("terms with GST on: separate 18% line, refund includes 50% of the GST", () => {
    const g = { ...env, OWNER_FEE_GST_ENABLED: "true" };
    const t = termsFor(feeViewOf(pricingConfig(g), g)).flatMap((s) => s.body).join("\n");
    assert.match(t, /The ₹499 includes GST at 18%, shown as a separate line on the invoice; nothing is added on top/);
    assert.match(t, /refunds 50% of the commission and 50% of the GST charged/);
  });
  test("terms date unchanged unless the owner-fee copy is live", () => {
    const prod = { ROOMEO_FEE_ENABLED: "true" }; // prod today: OWNER_FEE_ENABLED absent
    assert.equal(termsUpdated(feeViewOf(pricingConfig(prod), prod)), LEGAL_UPDATED);
    const both = { ROOMEO_FEE_ENABLED: "true", OWNER_FEE_ENABLED: "true" };
    assert.equal(termsUpdated(feeViewOf(pricingConfig(both), both)), OWNER_FEE_TERMS_UPDATED, "owner fee copy goes live → owner-fee date");
    assert.equal(termsUpdated(feeViewOf(pricingConfig({}), {})), LEGAL_UPDATED);
  });
  test("shared agreement (the tenant's copy) never shows the owner's commission rate or amount", () => {
    const cfg = pricingConfig(env);
    const body = agreementBody({ listingTitle: "Mud Home", address: "62 MPT Road", city: "Mangaluru", locality: "Bunder", monthlyRent: 5999, deposit: 5999, moveIn: "2026-11-20",
      tenantName: "ZZ TEST Tenant", ownerName: "ZZ TEST Owner", feeBaseInr: agreementFeeBaseInr(cfg), ownerFee: true });
    assert.equal(agreementFeeBaseInr(cfg), 0);
    assert.match(body, /Roomeo is free for the tenant/);
    assert.match(body, /will not charge the tenant any brokerage/);
    assert.doesNotMatch(body, /₹(499|589)/);
    for (const leak of [/₹\s?1,?200\b/, /₹\s?1,?416\b/, /₹\s?900\b/, /\b20 ?%/, /\b15 ?%/, /\bcommission\b/i, /GST/]) assert.doesNotMatch(body, leak, String(leak));
    assert.equal(ownerFeeAgreementClause(), ownerFeeAgreementClause(), "clause takes no rate or amount");
  });
  test("owner/admin only: the commission note and amounts are null for a tenant viewer", () => {
    const a = commissionAmounts(5999, 20);
    assert.equal(ownerFeeForViewer("tenant", a), null);
    assert.equal(ownerFeeForViewer("owner", a), a);
    assert.equal(ownerFeeForViewer("admin", a), a);
    assert.equal(ownerFeeForViewer("owner", null), null);
    assert.match(ownerCommissionNote(a), /only you see this/);
    assert.match(ownerCommissionNote(a), /₹1200/);
    assert.doesNotMatch(ownerCommissionNote(a), /GST/);
    assert.match(ownerCommissionNote(commissionAmounts(5999, 20, 18)), /₹216 GST/);
  });
  test("squad: each bed's rent is an equal share of the unit rent (nearest rupee); owner note counts beds", () => {
    assert.equal(squadBedRentInr(14000, 2), 7000);
    assert.equal(squadBedRentInr(6999, 2), 3500);
    assert.equal(squadBedRentInr(10000, 3), 3333);
    assert.equal(squadBedRentInr(5999, 1), 5999);
    assert.equal(commissionInr(squadBedRentInr(14000, 2), 20), 1400);
    assert.match(ownerCommissionNote(commissionAmounts(7000, 20), 2), /₹1400 per tenant, for each of the 2 tenants \(₹7000 rent each; ₹2800 in all\)/);
  });
  test("move-in agreement PDF text (the tenant can download it) has no commission", async () => {
    const { agreementText } = await import("./movein.ts");
    const txt = agreementText({ ownerName: "ZZ TEST Owner", tenantName: "ZZ TEST Tenant", propertyTitle: "ZZ TEST Mud Home", propertyAddress: "62 MPT Road", bedLabel: "B1",
      rentInr: 5999, depositInr: 5999, startDate: "2026-11-20", madeOn: "2026-11-15", minStayMonths: 3, noticeDays: 30, houseRules: "No smoking" }).join("\n");
    assert.match(txt, /₹5,999/);
    for (const leak of [/commission/i, /₹1,?200\b/, /\b20 ?%/, /GST/, /Roomeo/]) assert.doesNotMatch(txt, leak, String(leak));
  });
});

test("deal steps: tenant sees Free for tenants; owner sees the fee comes only after the deposit mark", async () => {
  const { dealSteps } = await import("./deal-steps.ts");
  const base = { iSigned: true, issued: true, cancelled: false, feeOn: false, feePaid: false, feeTotal: 0, movedIn: false };
  const tenant = dealSteps({ ...base, role: "tenant" }).find((s) => s.key === "pay")!;
  assert.match(tenant.hint, /Free for tenants/);
  assert.doesNotMatch(tenant.hint, /₹/);
  const owner = dealSteps({ ...base, role: "owner", ownerFeeTotal: 1200 }).find((s) => s.key === "pay")!;
  assert.match(owner.hint, /Nothing to pay now\. Roomeo's ₹1200 is charged only after you mark the deposit \+ rent advance as received \(on Fees\) and Roomeo checks it/);
  assert.equal(dealSteps({ ...base, role: "owner" }).find((s) => s.key === "pay")!.hint, "No fee right now. Skip ahead 🙌");
});

describe("flag-aware copy (Rohith, 18 Nov 2026): OWNER_FEE_ENABLED off still describes today's prod", () => {
  const prod = { ROOMEO_FEE_ENABLED: "true" }; // prod today: tenant ₹499 on, OWNER_FEE_ENABLED absent
  const on = { ...prod, OWNER_FEE_ENABLED: "true" };
  test("flag off: the owner still pays ₹499 upfront in the agreement step, and the copy says so", () => {
    assert.equal(pricingConfig(prod).successFeeOwnerInr, 499);
    const f = feeViewOf(pricingConfig(prod), prod);
    assert.match(homeChatStep(f), /renter and owner each pay ₹499/);
    const t = termsFor(f).flatMap((x) => x.body).join("\n");
    assert.doesNotMatch(t, /deposit and rent advance, marked it on Roomeo/);
    assert.equal(termsUpdated(f), LEGAL_UPDATED);
  });
  test("flag on: the upfront owner ₹499 is replaced by the after-deposit, admin-checked fee everywhere", () => {
    assert.equal(pricingConfig(on).successFeeOwnerInr, 0, "no upfront owner fee in the agreement step");
    assert.equal(pricingConfig(on).successFeeTenantInr, 499, "tenant fee unchanged");
    const f = feeViewOf(pricingConfig(on), on);
    assert.match(homeChatStep(f), /Owners pay ₹499 only after they've received the deposit and rent advance and Roomeo checks it/);
    const p = pricingCopy(f, { feeInr: 99, windowDays: 14 });
    assert.ok(p.faq.some(([, a]) => /Roomeo checks it, never upfront/.test(a)), "pricing FAQ");
    const t = termsFor(f).flatMap((x) => x.body).join("\n");
    assert.match(t, /marked it on Roomeo, and Roomeo has checked that mark/);
    assert.equal(termsUpdated(f), OWNER_FEE_TERMS_UPDATED);
  });
});
