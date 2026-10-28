import { useEffect, useState } from "react";
import { errText } from "@/lib/ui-text";
import { confirmSquadMoveIn, squadMoveInStatus, startSquadSuccessFee } from "@/lib/roomsetu/squad-api";
import { UpiCheckout, type UpiCheckoutData } from "@/components/upi-checkout";
import { btnSmallPrimary, errorBox, inner, skeleton } from "@/components/ui-tokens";

/** Squad move in: every member and the owner confirm. Fee (off at launch) is split per member. */
export function SquadMoveIn({ requestId }: { requestId: string }) {
  const [s, setS] = useState<Awaited<ReturnType<typeof squadMoveInStatus>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState<UpiCheckoutData | null>(null);
  const load = () => {
    void squadMoveInStatus({ data: { requestId } })
      .then(setS)
      .catch((e) => setError(errText(e)));
  };
  useEffect(load, [requestId]);
  if (!s) return error ? <p className={`mt-4 ${errorBox}`}>{error}</p> : <div className={`mt-4 h-12 ${skeleton}`} aria-busy="true" />;
  if (s.requestStatus !== "ACCEPTED") return null;
  return (
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
      {s.confirmed && s.feeEnabled && s.myFee > 0 ? (
        s.feeStatus === "PAID" ? (
          <p className="mt-2 text-muted">Move in fee paid. Thanks.</p>
        ) : s.feeStatus === "SUBMITTED" && !checkout ? (
          <p className="mt-2 text-muted">Move in fee received. Roomeo is confirming it.</p>
        ) : checkout ? (
          <UpiCheckout data={checkout} onClose={() => { setCheckout(null); load(); }} />
        ) : (
          <button
            type="button"
            disabled={busy}
            className={`mt-2 ${btnSmallPrimary}`}
            data-testid="pay-squad-success-fee"
            onClick={() => {
              setBusy(true);
              void startSquadSuccessFee({ data: { requestId } }).then(setCheckout).catch((e) => setError(errText(e))).finally(() => setBusy(false));
            }}
          >
            Pay ₹{s.myFee} {s.isOwner ? "move in fee" : "move in share"}
          </button>
        )
      ) : null}
      {error ? <p className={`mt-2 ${errorBox}`} role="alert">{error}</p> : null}
    </div>
  );
}
