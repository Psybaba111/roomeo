import { useCallback, useEffect, useState } from "react";
import { cancelDealAgreement, getDealAgreement, signDealAgreement, startAgreementFee } from "@/lib/roomsetu/agreement-api";
import { successFeeHeadsUp } from "@/lib/roomsetu/pricing";
import { errText } from "@/lib/ui-text";
import { UpiCheckout, type UpiCheckoutData } from "@/components/upi-checkout";
import { btnSmallPrimary, errorBox, inner } from "@/components/ui-tokens";

type Info = Awaited<ReturnType<typeof getDealAgreement>>;
const when = (t: string) => (t ? new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "");

/** Click-to-sign Roomeo agreement. Once both sign it is issued, and the one-time fee (+GST) is payable before move in. */
export function DealAgreement({ applicationId }: { applicationId: string }) {
  const [a, setA] = useState<Info | null>(null);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [checkout, setCheckout] = useState<UpiCheckoutData | null>(null);
  const load = useCallback(() => {
    void getDealAgreement({ data: { applicationId } }).then(setA).catch((e) => setError(errText(e)));
  }, [applicationId]);
  useEffect(load, [load]);
  if (!a) return error ? <p className={`mt-4 ${errorBox}`} role="alert">{error}</p> : null;
  const run = (p: Promise<unknown>) => {
    setBusy(true);
    setError("");
    void p.then(load).catch((e) => setError(errText(e))).finally(() => setBusy(false));
  };
  const f = a.fee;
  return (
    <div className={`mt-4 text-sm ${inner}`} data-testid="deal-agreement">
      <p className="font-semibold">Roomeo agreement · {a.state === "ISSUED" ? `issued ${when(a.issuedAt)}` : a.state === "CANCELLED" ? "cancelled" : a.iSigned ? "you signed, waiting on the other side" : "not signed yet"}</p>
      <button type="button" className="mt-1 underline" onClick={() => setOpen(!open)}>{open ? "Hide" : "Read"} the agreement</button>
      {open ? <pre className="mt-2 whitespace-pre-wrap font-sans text-xs" data-testid="agreement-body">{a.body}</pre> : null}
      {a.seeker.at || a.owner.at ? (
        <p className="mt-2 text-xs text-muted">
          {a.seeker.at ? `Tenant signed as ${a.seeker.name}, ${when(a.seeker.at)}. ` : ""}
          {a.owner.at ? `Owner signed as ${a.owner.name}, ${when(a.owner.at)}.` : ""}
        </p>
      ) : null}
      {a.feeEnabled && a.state !== "ISSUED" && a.state !== "CANCELLED" ? (
        <p className="mt-2 text-muted [text-wrap:pretty]" data-testid="success-fee-heads-up">{successFeeHeadsUp(f.base, a.role)}</p>
      ) : null}
      {!a.iSigned && a.state !== "CANCELLED" ? (
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(signDealAgreement({ data: { applicationId, name } })); }}>
          <input aria-label="Type your full name to sign" className="h-10 rounded-full border border-line px-3" placeholder="Type your full name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={busy || name.trim().length < 2} className={btnSmallPrimary} data-testid="sign-agreement">Sign it ✍️</button>
          <p className="w-full text-xs text-muted">Signing records your name, time and IP. Simple click-to-sign, not Aadhaar e-sign.</p>
        </form>
      ) : null}
      {a.state === "ISSUED" && a.feeEnabled ? (
        <div className="mt-3" data-testid="success-fee">
          <p className="font-semibold">One-time success fee, before move in</p>
          <ul className="mt-1 tabular-nums">
            <li>Platform fee: ₹{f.base.toFixed(2)}</li>
            <li>GST (18%): ₹{f.gst.toFixed(2)}</li>
            <li>Total: ₹{f.exact.toFixed(2)} → you pay ₹{f.total}</li>
          </ul>
          {a.feeStatus === "PAID" ? (
            <p className="mt-2 text-muted">Paid. You're all set 🎉</p>
          ) : a.feeStatus === "SUBMITTED" && !checkout ? (
            <p className="mt-2 text-muted">Got it. Roomeo is confirming your payment.</p>
          ) : checkout ? (
            <UpiCheckout data={checkout} onClose={() => { setCheckout(null); load(); }} />
          ) : (
            <button type="button" disabled={busy} className={`mt-2 ${btnSmallPrimary}`} data-testid="pay-success-fee"
              onClick={() => { setBusy(true); void startAgreementFee({ data: { applicationId } }).then(setCheckout).catch((e) => setError(errText(e))).finally(() => setBusy(false)); }}>
              Pay ₹{f.total} (incl. GST)
            </button>
          )}
        </div>
      ) : null}
      {a.state !== "CANCELLED" && (a.state === "ISSUED" || a.iSigned) ? (
        <button type="button" disabled={busy} className="mt-3 text-xs underline" data-testid="cancel-agreement"
          onClick={() => {
            const msg = a.state === "ISSUED" ? (a.canRefund ? "Cancel the agreement? It's within 7 days, so any success fee paid by either side gets refunded." : "Cancel the agreement? It's past 7 days, so the success fee isn't refundable.") : "Cancel the agreement?";
            if (!window.confirm(msg)) return;
            setBusy(true);
            void cancelDealAgreement({ data: { applicationId, reason: "" } })
              .then((r) => setNote(r.refunds ? `Cancelled. ${r.refunds} fee payment(s) queued for refund to UPI.` : "Cancelled."))
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
