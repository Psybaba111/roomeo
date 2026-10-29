import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { HostIdReview } from "@/components/host-id-review";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import {
  getVerification,
  startDigilocker,
  startPhoneOtp,
  verifyPhoneOtp,
} from "@/lib/roomsetu/trust-api";
import { digilockerLine, showDigilockerButton, VERIFICATION_INTRO } from "@/lib/roomsetu/verification-copy";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { resendSecondsLeft, verifyOtpMessage, type VerifyMessage } from "@/lib/roomsetu/otp-result";

export const Route = createFileRoute("/verification")({
  head: () => pageHead("Verification", { noindex: true }),
  component: () => (
    <NeedAccount next="/verification">
      <Verify />
    </NeedAccount>
  ),
});

function Verify() {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof getVerification>> | null>(null);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<VerifyMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cooldown = resendSecondsLeft(lastSentAt, now);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]);
  function sendCode() {
    setBusy(true);
    setPhoneMsg(null);
    void startPhoneOtp({ data: { phone } })
      .then((r) => {
        setSent(true);
        setCode("");
        setLastSentAt(Date.now());
        setNow(Date.now());
        setPhoneMsg({ text: `Code sent to ${r.phone}. It expires in ${r.ttlMinutes} minutes.`, tone: "success" });
      })
      .catch((err) => setPhoneMsg({ text: errText(err), tone: "error" }))
      .finally(() => setBusy(false));
  }
  function load() {
    void getVerification()
      .then(setData)
      .catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  const dlLine = data ? digilockerLine(data) : null;
  return (
    <Shell>
      <h1 className="font-display text-4xl">Verification</h1>
      <p className="mt-2 max-w-xl text-muted">
        {VERIFICATION_INTRO}
        
      </p>
      {error ? (
        <p className="mt-3 max-w-xl rounded-lg border border-danger p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {data?.canPublish ? (
        <p className="mt-3 inline-flex rounded-full bg-pop-soft px-3 py-1 text-sm font-semibold text-pop" data-testid="verified-badge">
          Verified ✓ you're all set
        </p>
      ) : null}
      <section className="mt-6 w-full max-w-xl rounded-2xl border border-line bg-card p-4">
        <h2 className="font-display text-2xl">Phone</h2>
        {!data ? (
          <div className="mt-2 h-11 animate-pulse rounded-lg bg-paper motion-reduce:animate-none" aria-busy="true" aria-label="Loading phone status" />
        ) : data.phoneVerified ? (
          <p className="mt-2 text-sm font-semibold text-pop" data-testid="phone-verified">Phone verified ✓ {data.phone}</p>
        ) : data?.otpReady === false ? (
          <p className="mt-2 text-sm text-muted">
            Phone verification is coming soon.
          </p>
        ) : (
          <form
            className="mt-2 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              if (!sent) sendCode();
              else {
                setBusy(true);
                setPhoneMsg(null);
                void verifyPhoneOtp({ data: { code } })
                  .then((r) => {
                    const msg = verifyOtpMessage(r);
                    setPhoneMsg(msg);
                    if (r.ok) load();
                  })
                  .catch((err) => setPhoneMsg({ text: errText(err), tone: "error" }))
                  .finally(() => setBusy(false));
              }
            }}
          >
            {!sent ? (
              <input
                aria-label="Mobile number"
                inputMode="tel"
                autoComplete="tel"
                className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3 sm:flex-none"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
                required
              />
            ) : (
              <input
                aria-label="One time code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="h-11 w-32 rounded-lg border border-line px-3 font-mono"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={busy}
                required
              />
            )}
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="h-11 rounded-full bg-ink px-4 text-sm font-semibold text-card disabled:opacity-50"
            >
              {busy ? (sent ? "Checking…" : "Sending…") : sent ? "Verify code" : "Send code"}
            </button>
            {sent ? (
              <>
                <button
                  type="button"
                  className="h-11 text-sm underline disabled:no-underline disabled:opacity-50"
                  disabled={busy || cooldown > 0}
                  onClick={sendCode}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
                <button type="button" className="h-11 text-sm underline" disabled={busy} onClick={() => { setSent(false); setCode(""); setPhoneMsg(null); }}>
                  Change number
                </button>
              </>
            ) : null}
          </form>
        )}
        {phoneMsg ? (
          <p role="status" aria-live="polite" className={`mt-2 text-sm ${phoneMsg.tone === "error" ? "text-danger" : ""}`}>
            {phoneMsg.text}
          </p>
        ) : null}
      </section>
      <h2 className="mt-8 font-display text-2xl">ID</h2>
      {dlLine ? <p className="mt-2 max-w-xl text-muted">{dlLine}</p> : null}
      {data && showDigilockerButton(data) ? (
        <button
          type="button"
          className="mt-4 h-12 rounded-full bg-brand px-4 font-semibold text-card disabled:opacity-50"
          onClick={() => {
            setError("");
            void startDigilocker()
              .then((res) => {
                window.location.href = res.url;
              })
              .catch((e) => setError(errText(e)));
          }}
        >
          Continue with DigiLocker
        </button>
      ) : null}
      <HostIdReview digilockerReady={data?.digilockerReady} phoneVerified={Boolean(data?.phoneVerified)} onChange={load} />
    </Shell>
  );
}
