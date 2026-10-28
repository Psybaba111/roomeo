import { useState } from "react";
import { errText } from "@/lib/ui-text";
import { submitUtr } from "@/lib/roomsetu/account-api";
import { input } from "@/components/ui-tokens";

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
  const isContact = /contact unlock/i.test(data.plan);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(
    data.status === "SUBMITTED" ? "UTR received. We're checking it." : "",
  );
  const [error, setError] = useState("");
  const done = data.status === "SUBMITTED" || msg.startsWith("Thanks");
  return (
    <div className="mt-4 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            Pay ₹{data.amount} for {data.plan}
          </p>
          <p className="text-sm text-muted">
            Direct UPI to {data.payee} ({data.vpa}). No gateway, no commission. Ref{" "}
            <span className="font-mono">{data.ref}</span>
          </p>
        </div>
        <button type="button" className="text-sm text-muted underline" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <img
          src={data.qr}
          alt={`UPI QR code to pay ₹${data.amount} to ${data.payee}`}
          width={200}
          height={200}
          className="rounded-lg border border-line"
        />
        <div className="flex-1 space-y-3">
          {isMobile() ? (
            <a
              href={data.link}
              className="inline-flex h-11 items-center rounded-full bg-ink px-5 font-semibold text-card"
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
                    If the owner declines your request, we refund the fee to this UPI ID. No refund
                    once the owner has accepted, or if you withdraw or leave.
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
                className="h-11 w-full rounded-lg border border-line px-3 font-mono"
                placeholder="412345678901"
                required
              />
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="h-10 rounded-full bg-brand px-4 text-sm font-semibold text-card disabled:opacity-60"
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
