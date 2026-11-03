import { useState } from "react";
import { startPhoneOtp, verifyPhoneOtp } from "@/lib/roomsetu/trust-api";
import { verifyOtpMessage } from "@/lib/roomsetu/otp-result";
import { verifyStepCopy } from "@/lib/roomsetu/phone-gate";
import { errText } from "@/lib/ui-text";

/**
 * Inline OTP in the chat composer. Uses the same startPhoneOtp / verifyPhoneOtp as /verification
 * (provider unchanged). Calls onVerified once the phone is verified so the queued message can send.
 */
export function InlinePhoneVerify({ onVerified, onCancel }: { onVerified: () => Promise<void>; onCancel: () => void }) {
  const [step, setStep] = useState<"phone" | "code" | "sending">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const copy = verifyStepCopy(step);
  const field = "h-12 min-w-0 flex-1 rounded-full border border-line bg-card px-4";
  return (
    <form
      className="mx-3 mb-3 min-w-0 rounded-2xl border-2 border-brand bg-brand-soft p-4"
      data-testid="inline-verify"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setNote("");
        if (step === "phone") {
          void startPhoneOtp({ data: { phone } })
            .then((r) => {
              setStep("code");
              setNote(`Code sent to ${r.phone}${r.channel === "whatsapp" ? " on WhatsApp" : r.channel === "sms" ? " by SMS" : ""} ✨`);
            })
            .catch((err) => setNote(errText(err)))
            .finally(() => setBusy(false));
          return;
        }
        void verifyPhoneOtp({ data: { code } })
          .then(async (r) => {
            if (!r.ok) {
              setNote(verifyOtpMessage(r).text);
              return;
            }
            setStep("sending");
            await onVerified();
          })
          .catch((err) => setNote(errText(err)))
          .finally(() => setBusy(false));
      }}
    >
      <p className="font-semibold">{copy.title}</p>
      {copy.hint ? <p className="mt-1 text-sm text-muted">{copy.hint}</p> : null}
      {step !== "sending" ? (
        <div className="mt-3 flex min-w-0 items-center gap-2">
          {step === "phone" ? (
            <input
              aria-label="Mobile number"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              className={field}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              data-testid="inline-phone"
            />
          ) : (
            <input
              aria-label="One time code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              className={`${field} font-mono`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              data-testid="inline-code"
            />
          )}
          <button type="submit" disabled={busy} className="h-12 shrink-0 rounded-full bg-brand px-4 text-sm font-semibold text-card disabled:opacity-60">
            {busy ? "…" : copy.cta}
          </button>
        </div>
      ) : null}
      {note ? (
        <p className="mt-2 text-sm" role="status">
          {note}
        </p>
      ) : null}
      {step !== "sending" ? (
        <button type="button" className="mt-2 text-xs text-muted underline" onClick={onCancel}>
          Not now
        </button>
      ) : null}
    </form>
  );
}
