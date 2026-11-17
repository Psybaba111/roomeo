import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { COMMISSION_STATUSES, FOUNDING_FEE_INR, canMarkPaid, canRecordEarlyExit, canRefund50, commissionLine, flatCommissionAmounts, foundingCommissionAmounts, ownerCommissionNote, ownerFeeView } from "./owner-fee.ts";
import { termsFor } from "../legal.ts";
import { FEE_OFF } from "./fee-copy.ts";

describe("founding partners pay ₹0 (owner side, flat-fee model)", () => {
  test("amounts: ₹0 fee, ₹0 GST, ₹0 total, whatever the rent", () => {
    assert.equal(FOUNDING_FEE_INR, 0);
    for (const rent of [4999, 8999, 25000]) assert.deepEqual(foundingCommissionAmounts(rent), { rentInr: rent, ratePct: 0, feeInr: 0, gstPct: 0, gstInr: 0, totalInr: 0 });
    // Non-founding owners are unchanged: ₹499 all-in.
    assert.equal(flatCommissionAmounts(8999, 18, 499).totalInr, 499);
  });
  test("owner note and admin line say ₹0 and ask for nothing", () => {
    const note = ownerCommissionNote(foundingCommissionAmounts(8999));
    assert.match(note, /₹0/);
    assert.match(note, /founding partner/);
    assert.doesNotMatch(note, /due within|payment link|₹499/);
    assert.match(ownerCommissionNote(foundingCommissionAmounts(9000), 3), /these 3 tenants/);
    assert.match(commissionLine({ ...foundingCommissionAmounts(8999), ratePct: null, founding: true }), /Founding partner: ₹0.*no invoice/);
    // A non-founding flat row still reads ₹499.
    assert.match(commissionLine({ ...flatCommissionAmounts(8999, 18, 499), ratePct: null, founding: false }), /Flat ₹499/);
  });
  test("'waived' is a status with nothing to pay, refund or halve", () => {
    assert.ok(COMMISSION_STATUSES.includes("waived"));
    assert.equal(canMarkPaid("waived"), false);
    assert.equal(canRecordEarlyExit("waived"), false);
    assert.equal(canRefund50("waived"), false);
  });
  test("owner terms tell founding partners they pay ₹0 with no invoice", () => {
    const on = { ...FEE_OFF, owner: ownerFeeView(true, 18, 499) };
    const text = JSON.stringify(termsFor(on));
    assert.match(text, /Founding partners.*pay ₹0/);
  });
});
