import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell, errText } from "@/components/shell";
import { getVerification, startDigilocker } from "@/lib/roomsetu/trust-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/verification")({
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
  function load() {
    void getVerification().then(setData).catch((e) => setError(errText(e)));
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
      <h1 className="font-display text-4xl">Identity</h1>
      <p className="mt-2 max-w-xl text-muted">{statusLine}</p>
      <p className="mt-2 max-w-xl text-sm text-muted">On each rent payment, you pay ₹{data?.feeInr ?? 499} on top of the rent. The host’s ₹{data?.feeInr ?? 499} is taken from the payout.</p>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      {data?.digilockerReady === false ? (
        <p className="mt-4 max-w-xl text-sm">The DigiLocker sign-in is built. This deployment still needs the partner client id and secret before a live check can start.</p>
      ) : null}
      <button
        type="button"
        className="mt-6 h-12 rounded-full bg-brand px-5 font-semibold text-card disabled:opacity-50"
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
    </Shell>
  );
}
