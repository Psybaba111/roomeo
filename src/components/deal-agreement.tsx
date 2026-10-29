import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cancelDealAgreement, getDealAgreement, signDealAgreement, startAgreementFee } from "@/lib/roomsetu/agreement-api";
import { successFeeHeadsUp } from "@/lib/roomsetu/pricing";
import { errText } from "@/lib/ui-text";
import { UpiCheckout, type UpiCheckoutData } from "@/components/upi-checkout";
import { btnSmallPrimary, errorBox, inner } from "@/components/ui-tokens";

type Info = Awaited<ReturnType<typeof getDealAgreement>>;
export type DealRef = { kind: "app" | "squad"; id: string };
const when = (t: string) => (t ? new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "");
const dot = { done: "bg-lime text-ink", now: "bg-brand text-card", todo: "border border-line text-muted" } as const;

/** Step tracker + click-to-sign Roomeo agreement + one-time fee (incl. GST) for 1:1 and squad deals. */
export function DealAgreement({ dealRef }: { dealRef: DealRef }) {
  const [a, setA] = useState<Info | null>(null);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [checkout, setCheckout] = useState<UpiCheckoutData | null>(null);
  const load = useCallback(() => {
    void getDealAgreement({ data: dealRef }).then(setA).catch((e) => setError(errText(e)));
  }, [dealRef.kind, dealRef.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  if (!a) return error ? <p className={`mt-4 ${errorBox}`} role="alert">{error}</p> : null;
  const run = (p: Promise<unknown>) => {
    setBusy(true);
    setError("");
    void p.then(load).catch((e) => setError(errText(e))).finally(() => setBusy(false));
  };
  const f = a.fee;
  const who = a.role === "owner" ? "You (owner)" : a.kind === "squad" ? "You (squad member)" : "You (tenant)";
  return (
    <div className={`mt-4 text-sm ${inner}`} data-testid="deal-agreement">
      <ol className="flex flex-wrap gap-2" data-testid="deal-steps" aria-label="Deal steps">
        {a.steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2" data-state={s.state}>
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${dot[s.state]}`}>{s.state === "done" ? "✓" : i + 1}</span>
            <span className={s.state === "now" ? "font-semibold" : s.state === "todo" ? "text-muted" : ""}>{s.label}</span>
          </li>
        ))}
      </ol>
      {a.state === "CANCELLED" ? (
        <p className="mt-2 font-semibold" data-testid="deal-now">Agreement cancelled {when(a.cancelledAt)}. Any refund owed is on its way to your UPI ID.</p>
      ) : (
        <p className="mt-2" data-testid="deal-now">{a.steps.find((s) => s.state === "now")?.hint ?? "All done 🎉"}</p>
      )}
      <p className="mt-1 text-xs text-muted">
        {who}. {a.feeEnabled ? `Tenant${a.kind === "squad" ? " (each squad member)" : ""} pays ₹${f.total} once and the owner pays ₹${f.total} once (₹${f.base} + 18% GST each), after everyone signs and before move in. Cancel within 7 days of the issue date → full refund to everyone who paid. After 7 days, no refund.` : "No Roomeo fee right now. Rent and deposit go straight to the owner."}
      </p>

      <div className="mt-3 border-t border-line pt-3">
        <p className="font-semibold">
          Roomeo agreement · {a.state === "ISSUED" ? `issued ${when(a.issuedAt)}` : a.state === "CANCELLED" ? "cancelled" : a.iSigned ? "you signed ✓" : "waiting for your signature"}
          {a.squad ? ` · ${a.squad.signed}/${a.squad.members} flatmates signed · owner ${a.owner.at ? "signed" : "not yet"}` : ""}
        </p>
        <button type="button" className="mt-1 underline" onClick={() => setOpen(!open)}>{open ? "Hide" : "Read"} the agreement</button>
        {open ? <pre className="mt-2 whitespace-pre-wrap font-sans text-xs" data-testid="agreement-body">{a.body}</pre> : null}
        {!a.squad && (a.seeker.at || a.owner.at) ? (
          <p className="mt-2 text-xs text-muted">
            {a.seeker.at ? `Tenant signed as ${a.seeker.name}, ${when(a.seeker.at)}. ` : ""}
            {a.owner.at ? `Owner signed as ${a.owner.name}, ${when(a.owner.at)}.` : ""}
          </p>
        ) : null}
        {a.squad?.names.length ? <p className="mt-2 text-xs text-muted">Signed: {a.squad.names.join(", ")}</p> : null}
        {a.feeEnabled && !a.iSigned && a.state !== "CANCELLED" ? (
          <p className="mt-2 text-muted [text-wrap:pretty]" data-testid="success-fee-heads-up">{successFeeHeadsUp(f.base, a.role)}</p>
        ) : null}
        {!a.iSigned && a.state !== "CANCELLED" ? (
          <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(signDealAgreement({ data: { ...dealRef, name } })); }}>
            <input aria-label="Type your full name to sign" className="h-10 rounded-full border border-line px-3" placeholder="Type your full name" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" disabled={busy || name.trim().length < 2} className={btnSmallPrimary} data-testid="sign-agreement">Sign it ✍️</button>
            <p className="w-full text-xs text-muted">Signing saves your name, time and IP. Simple click-to-sign, not Aadhaar e-sign.</p>
          </form>
        ) : null}
      </div>

      {a.state === "ISSUED" && a.feeEnabled ? (
        <div className="mt-3 border-t border-line pt-3" data-testid="success-fee">
          <p className="font-semibold">Your one-time fee</p>
          <ul className="mt-1 tabular-nums">
            <li>Platform fee: ₹{f.base.toFixed(2)}</li>
            <li>GST (18%): ₹{f.gst.toFixed(2)}</li>
            <li>Total: ₹{f.exact.toFixed(2)} → you pay ₹{f.total}</li>
          </ul>
          {a.feeStatus === "PAID" ? (
            <p className="mt-2">Paid ✅ {a.feePaymentId ? <Link to="/invoice/$paymentId" params={{ paymentId: a.feePaymentId }} className="underline" data-testid="invoice-link">See GST invoice</Link> : null}</p>
          ) : a.feeStatus === "SUBMITTED" && !checkout ? (
            <p className="mt-2 text-muted">Got it. Roomeo is confirming your payment, then your invoice drops here.</p>
          ) : checkout ? (
            <UpiCheckout data={checkout} onClose={() => { setCheckout(null); load(); }} />
          ) : (
            <button type="button" disabled={busy} className={`mt-2 ${btnSmallPrimary}`} data-testid="pay-success-fee"
              onClick={() => { setBusy(true); void startAgreementFee({ data: dealRef }).then(setCheckout).catch((e) => setError(errText(e))).finally(() => setBusy(false)); }}>
              Pay ₹{f.total} (incl. GST)
            </button>
          )}
        </div>
      ) : null}

      {a.state !== "CANCELLED" && (a.state === "ISSUED" || a.iSigned) ? (
        <button type="button" disabled={busy} className="mt-3 text-xs underline" data-testid="cancel-agreement"
          onClick={() => {
            const msg = a.state === "ISSUED" ? (a.canRefund ? "Cancel the agreement? You're inside 7 days, so every fee paid on it (both sides) gets refunded." : "Cancel the agreement? It's past 7 days, so fees already paid aren't refundable.") : "Cancel the agreement?";
            if (!window.confirm(msg)) return;
            setBusy(true);
            void cancelDealAgreement({ data: { ...dealRef, reason: "" } })
              .then((r) => setNote(r.refunds ? `Cancelled. ${r.refunds} fee payment(s) queued for UPI refund.` : "Cancelled."))
              .then(load).catch((e) => setError(errText(e))).finally(() => setBusy(false));
          }}>
          Cancel agreement
        </button>
      ) : null}
      {note ? <p className="mt-2 text-muted">{note}</p> : null}
      {error ? <p className={`mt-2 ${errorBox}`} role="alert">{error}</p> : null}
    </div>
  );
}
