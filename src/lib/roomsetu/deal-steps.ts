import { successFeeSplit } from "./deal-agreement.ts";
import { LEGACY_SUCCESS_FEE_TOTAL_INR, SUCCESS_FEE_INR } from "./pricing.ts";

/** Step-by-step status for both sides: Accepted → Sign agreement → Pay fee → Move in. */
export type StepState = "done" | "now" | "todo";
export type DealStep = { key: "accepted" | "sign" | "pay" | "movein"; label: string; state: StepState; hint: string };

export function dealSteps(p: { role: "tenant" | "owner"; squad?: boolean; iSigned: boolean; issued: boolean; cancelled: boolean; feeOn: boolean; feePaid: boolean; feeTotal: number; feeBase?: number; movedIn: boolean; ownerFeeTotal?: number }): DealStep[] {
  const f = successFeeSplit(p.feeBase ?? SUCCESS_FEE_INR);
  const other = p.role === "tenant" ? (p.squad ? "the owner and your squad" : "the owner") : p.squad ? "every squad member" : "the tenant";
  const signHint = p.issued ? "Signed by everyone. Agreement issued." : p.iSigned ? `You signed. Waiting on ${other}.` : `Read it, type your name, sign. ${other[0].toUpperCase() + other.slice(1)} signs too.`;
  const payHint = !p.feeOn
    ? p.role === "tenant"
      ? "Free for tenants. Nothing to pay Roomeo. Skip ahead 🙌"
      : p.ownerFeeTotal
        ? `Nothing to pay now. Roomeo's commission (₹${p.ownerFeeTotal}) is due within 7 days of move-in.`
        : "No fee right now. Skip ahead 🙌"
    : p.feePaid ? "Paid. Invoice is ready." : payLine(p.feeTotal, f.total, p.role);
  const steps: Omit<DealStep, "state">[] = [
    { key: "accepted", label: "Accepted", hint: "Owner said yes 🎉" },
    { key: "sign", label: "Sign agreement", hint: signHint },
    { key: "pay", label: "Pay fee", hint: payHint },
    { key: "movein", label: "Move in", hint: p.movedIn ? "You're in. Welcome home 🏠" : "Both sides tap Confirm move in on the day." },
  ];
  const done = { accepted: true, sign: p.issued, pay: p.issued && (!p.feeOn || p.feePaid), movein: p.movedIn };
  let nowSet = p.cancelled;
  return steps.map((s) => {
    if (done[s.key]) return { ...s, state: "done" as const };
    if (!nowSet) { nowSet = true; return { ...s, state: "now" as const }; }
    return { ...s, state: "todo" as const };
  });
}

/**
 * The pay-step line. A fee row created before 17 Nov 2026 keeps its ₹589 (₹499 + GST) wording, or ₹490 after the
 * ₹99 trial credit; everything newer is the all-in amount (₹499, GST included).
 */
function payLine(feeTotal: number, total: number, role: "tenant" | "owner"): string {
  const otherSide = role === "tenant" ? "owner" : "tenant";
  const refund = "If the stay ends within 7 days of paying, both sides get their fee back.";
  const credit = ", less your ₹99 trial credit, which is non-refundable";
  const legacy = total !== LEGACY_SUCCESS_FEE_TOTAL_INR && (feeTotal === LEGACY_SUCCESS_FEE_TOTAL_INR || feeTotal === LEGACY_SUCCESS_FEE_TOTAL_INR - 99);
  if (legacy) return `You pay ₹${feeTotal} once (₹499 + 18% GST = ₹589${feeTotal < LEGACY_SUCCESS_FEE_TOTAL_INR ? credit : ""}), before move in. The ${otherSide} pays ₹589 once too. ${refund}`;
  return `You pay ₹${feeTotal} once (${feeTotal < total ? `₹${total} incl. 18% GST${credit}` : "18% GST included"}), before move in. The ${otherSide} pays ₹${total} once too. ${refund}`;
}
