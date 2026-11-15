import { feeWithGst } from "./deal-agreement.ts";
import { SUCCESS_FEE_INR } from "./pricing.ts";

/** Step-by-step status for both sides: Accepted → Sign agreement → Pay fee → Move in. */
export type StepState = "done" | "now" | "todo";
export type DealStep = { key: "accepted" | "sign" | "pay" | "movein"; label: string; state: StepState; hint: string };

export function dealSteps(p: { role: "tenant" | "owner"; squad?: boolean; iSigned: boolean; issued: boolean; cancelled: boolean; feeOn: boolean; feePaid: boolean; feeTotal: number; feeBase?: number; movedIn: boolean; ownerFeeTotal?: number }): DealStep[] {
  const f = feeWithGst(p.feeBase ?? SUCCESS_FEE_INR);
  const other = p.role === "tenant" ? (p.squad ? "the owner and your squad" : "the owner") : p.squad ? "every squad member" : "the tenant";
  const signHint = p.issued ? "Signed by everyone. Agreement issued." : p.iSigned ? `You signed. Waiting on ${other}.` : `Read it, type your name, sign. ${other[0].toUpperCase() + other.slice(1)} signs too.`;
  const payHint = !p.feeOn
    ? p.role === "tenant"
      ? "Free for tenants. Nothing to pay Roomeo. Skip ahead 🙌"
      : p.ownerFeeTotal
        ? `Nothing to pay now. Roomeo's commission (₹${p.ownerFeeTotal} incl. GST) is due within 7 days of move-in.`
        : "No fee right now. Skip ahead 🙌"
    : p.feePaid ? "Paid. Invoice is ready." : `You pay ₹${p.feeTotal} once (₹${f.base} + 18% GST = ₹${f.total}${p.feeTotal < f.total ? ", less your ₹99 trial credit, which is non-refundable" : ""}), before move in. The ${p.role === "tenant" ? "owner" : "tenant"} pays ₹${f.total} once too. If the stay ends within 7 days of paying, both sides get their fee back.`;
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
