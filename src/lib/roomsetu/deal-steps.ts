/** Step-by-step status for both sides: Accepted → Sign agreement → Pay fee → Move in. */
export type StepState = "done" | "now" | "todo";
export type DealStep = { key: "accepted" | "sign" | "pay" | "movein"; label: string; state: StepState; hint: string };

export function dealSteps(p: { role: "tenant" | "owner"; squad?: boolean; iSigned: boolean; issued: boolean; cancelled: boolean; feeOn: boolean; feePaid: boolean; feeTotal: number; movedIn: boolean }): DealStep[] {
  const other = p.role === "tenant" ? (p.squad ? "the owner and your squad" : "the owner") : p.squad ? "every squad member" : "the tenant";
  const signHint = p.issued ? "Signed by everyone. Agreement issued." : p.iSigned ? `You signed. Waiting on ${other}.` : `Read it, type your name, sign. ${other[0].toUpperCase() + other.slice(1)} signs too.`;
  const payHint = !p.feeOn ? "No fee right now. Skip ahead 🙌" : p.feePaid ? "Paid. Invoice is ready." : `You pay ₹${p.feeTotal} once (₹999 + 18% GST), before move in. Cancel within 7 days of issue and everyone gets it back.`;
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
