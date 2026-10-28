import { useState } from "react";
import { errText } from "@/lib/ui-text";
import { submitUtr } from "@/lib/roomsetu/account-api";
import { btnDark, btnSmall, btnSmallPrimary, errorBox, input } from "@/components/ui-tokens";

export type UpiCheckoutData = {
  ref: string;
  status: string;
  amount: number;
  plan: string;
  payee: string;
  vpa: string;
  link: string;
  qr: string;
};

function isMobile() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function UpiCheckout({ data, onClose }: { data: UpiCheckoutData; onClose: () => void }) {
  const [utr, setUtr] = useState("");
  const [payerVpa, setPayerVpa] = useState("");
  const isContact = /contact unlock|squad share|pass/i.test(data.plan);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(
    data.status === "SUBMITTED" ? "UTR received. We're checking it." : "",
  );
  const [error, setError] = useState("");
  const done = data.status === "SUBMITTED" || msg.startsWith("Thanks");
  return (
    <div className="mt-4 rounded-2xl border border-line bg-card p-4" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            Pay ₹{data.amount} for {data.plan}
          </p>
          <p className="text-sm text-muted">
            Direct UPI to {data.payee} ({data.vpa}). No gateway, no commission. Ref{" "}
            <span className="font-mono">{data.ref}</span>
          </p>
        </div>
        <button type="button" className={`${btnSmall} shrink-0`} onClick={onClose}>
          Close
        </button>
      </div>
      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <img
          src={data.qr}
          alt={`UPI QR code to pay ₹${data.amount} to ${data.payee}`}
          width={200}
          height={200}
          className="border border-line bg-card"
        />
        <div className="flex-1 space-y-3">
          {isMobile() ? (
            <a
              href={data.link}
              className={btnDark}
            >
              Pay with UPI app
            </a>
          ) : (
            <p className="text-sm text-muted">
              Scan with any UPI app (GPay, PhonePe, Paytm, BHIM).
            </p>
          )}
          {done ? (
            <p className="text-sm">{msg || "UTR received. We're checking it."}</p>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                setError("");
                setBusy(true);
                void submitUtr({
                  data: { ref: data.ref, utr, payerVpa: isContact ? payerVpa : undefined },
                })
                  .then((res) => setMsg(res.message))
                  .catch((err) => setError(errText(err)))
                  .finally(() => setBusy(false));
              }}
            >
              {isContact ? (
                <>
                  <label className="block text-sm font-semibold" htmlFor="payer-vpa">
                    Your UPI ID (for refunds)
                  </label>
                  <input
                    id="payer-vpa"
                    className={input}
                    value={payerVpa}
                    onChange={(e) => setPayerVpa(e.target.value.trim())}
                    placeholder="yourname@okbank"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted">
                    Refunds under the refund promise go back to this UPI ID. No refund once an
                    owner has replied or accepted, or if you withdraw or leave.
                  </p>
                </>
              ) : null}
              <label className="block text-sm font-semibold" htmlFor="utr">
                After paying, enter the 12-digit UTR
              </label>
              <input
                id="utr"
                inputMode="numeric"
                autoComplete="off"
                maxLength={14}
                pattern="[0-9 ]{12,14}"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                className={`${input} font-mono`}
                placeholder="412345678901"
                required
              />
              {error ? <p className={errorBox} role="alert">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className={btnSmallPrimary}
              >
                {busy ? "Sending…" : "Submit UTR"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
