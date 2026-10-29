import { useEffect, useState } from "react";
import { errText } from "@/lib/ui-text";
import { confirmSquadMoveIn, squadMoveInStatus } from "@/lib/roomsetu/squad-api";
import { DealAgreement } from "@/components/deal-agreement";
import { btnSmallPrimary, errorBox, inner, skeleton } from "@/components/ui-tokens";

/** Squad deal: agreement (everyone signs), fee (each person pays in full), then everyone confirms move in. */
export function SquadMoveIn({ requestId }: { requestId: string }) {
  const [s, setS] = useState<Awaited<ReturnType<typeof squadMoveInStatus>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => {
    void squadMoveInStatus({ data: { requestId } })
      .then(setS)
      .catch((e) => setError(errText(e)));
  };
  useEffect(load, [requestId]);
  if (!s) return error ? <p className={`mt-4 ${errorBox}`}>{error}</p> : <div className={`mt-4 h-12 ${skeleton}`} aria-busy="true" />;
  if (s.requestStatus !== "ACCEPTED") return null;
  return (
    <>
    <DealAgreement dealRef={{ kind: "squad", id: requestId }} />
    <div className={`mt-4 text-sm ${inner}`} data-testid="squad-move-in">
      <p data-testid="squad-move-in-progress">
        {s.confirmed
          ? "Move in confirmed by the whole squad and the owner."
          : `${s.membersConfirmed} of ${s.members} flatmates confirmed · owner ${s.ownerConfirmed ? "confirmed" : "not yet"}.`}
      </p>
      {!s.confirmed && !s.meConfirmed ? (
        <button
          type="button"
          disabled={busy}
          className={`mt-2 ${btnSmallPrimary}`}
          data-testid="confirm-squad-move-in"
          onClick={() => {
            setBusy(true);
            setError("");
            void confirmSquadMoveIn({ data: { requestId } }).then(load).catch((e) => setError(errText(e))).finally(() => setBusy(false));
          }}
        >
          Confirm move in
        </button>
      ) : null}
      {error ? <p className={`mt-2 ${errorBox}`} role="alert">{error}</p> : null}
    </div>
    </>
  );
}
