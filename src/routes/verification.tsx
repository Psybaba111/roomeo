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
import { useCurrentUserState } from "@/lib/auth/use-current-user";

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
  const [phoneMsg, setPhoneMsg] = useState("");
  function load() {
    void getVerification()
      .then(setData)
      .catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  const source = data?.identitySource;
  const statusLine =
    source === "DIGILOCKER"
      ? "DigiLocker passed. This is the government check."
      : source === "STAFF"
        ? "Passed by the desk. This is not a government check."
        : data?.identityStatus === "FAILED"
          ? "DigiLocker failed twice. The desk can still pass it. That pass is not a government check."
          : data && data.attempts > 0
            ? "DigiLocker did not pass. One retry is left."
            : "Identity is checked with DigiLocker before rent is collected. Messaging stays open.";
  const blocked = (data?.attempts ?? 0) >= 2 && data?.identityStatus !== "VERIFIED";
  return (
    <Shell>
      <h1 className="font-display text-4xl">Verification</h1>
      <p className="mt-2 max-w-xl text-muted">
        To publish a bed you need both a verified phone and a verified ID. The Verified badge only
        shows once both pass.
        {data ? (data.canPublish ? " You're all set to publish." : "") : ""}
      </p>
      <section className="mt-6 max-w-xl rounded-2xl border border-line bg-card p-4">
        <h2 className="font-display text-2xl">Phone</h2>
        {data?.phoneVerified ? (
          <p className="mt-2 text-sm">Verified: {data.phone}</p>
        ) : data?.otpReady === false ? (
          <p className="mt-2 text-sm text-muted">
            Phone codes aren't set up on this deployment yet.
          </p>
        ) : (
          <form
            className="mt-2 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              if (!sent) {
                void startPhoneOtp({ data: { phone } })
                  .then((r) => {
                    setSent(true);
                    setPhoneMsg(`We sent a 6-digit code to ${r.phone}.`);
                  })
                  .catch((err) => setError(errText(err)));
              } else {
                void verifyPhoneOtp({ data: { code } })
                  .then(() => {
                    setPhoneMsg("Phone verified.");
                    load();
                  })
                  .catch((err) => setError(errText(err)));
              }
            }}
          >
            {!sent ? (
              <input
                aria-label="Mobile number"
                inputMode="tel"
                autoComplete="tel"
                className="h-11 rounded-lg border border-line px-3"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            ) : (
              <input
                aria-label="One time code"
                inputMode="numeric"
                autoComplete="one time-code"
                maxLength={6}
                className="h-11 w-32 rounded-lg border border-line px-3 font-mono"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            )}
            <button
              type="submit"
              className="h-11 rounded-full bg-ink px-4 text-sm font-semibold text-card"
            >
              {sent ? "Verify code" : "Send code"}
            </button>
            {sent ? (
              <button type="button" className="text-sm underline" onClick={() => setSent(false)}>
                Change number
              </button>
            ) : null}
          </form>
        )}
        {phoneMsg ? <p className="mt-2 text-sm">{phoneMsg}</p> : null}
      </section>
      <h2 className="mt-8 font-display text-2xl">Identity</h2>
      <p className="mt-2 max-w-xl text-muted">{statusLine}</p>
      <p className="mt-2 max-w-xl text-sm text-muted">
        On each rent payment, you pay ₹{data?.feeInr ?? 499} on top of the rent. The host’s ₹
        {data?.feeInr ?? 499} is taken from the payout.
      </p>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      {data?.digilockerReady === false ? (
        <p className="mt-4 max-w-xl text-sm">
          The DigiLocker sign in is built. This deployment still needs the partner client id and
          secret before a live check can start.
        </p>
      ) : null}
      <button
        type="button"
        className="mt-6 h-12 rounded-full bg-brand px-4 font-semibold text-card disabled:opacity-50"
        disabled={!data?.digilockerReady || blocked || source === "DIGILOCKER"}
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
      <HostIdReview />
    </Shell>
  );
}
