import { useState } from "react";
import { errText } from "@/lib/ui-text";
import { confirmMoveIn, myMoveIns } from "@/lib/roomsetu/pricing-api";
import { btnSmallPrimary, errorBox, inner } from "@/components/ui-tokens";

export type MoveInfo = Awaited<ReturnType<typeof myMoveIns>>;

/**
 * Both sides confirm the move in. Extracted from /applications unchanged so
 * Activity and the old requests screen share one implementation.
 */
export function MoveIn({
  applicationId,
  mine,
  info,
  reload,
  extra,
}: {
  applicationId: string;
  mine: boolean;
  info: MoveInfo | null;
  reload: () => void;
  extra?: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const m = info?.items.find((i) => i.applicationId === applicationId);
  const meDone = mine ? m?.seekerConfirmed : m?.ownerConfirmed;
  return (
    <div className={`mt-4 text-sm ${inner}`} data-testid="move-in">
      {m?.confirmed ? (
        <p className="font-semibold" data-testid="move-in-confirmed">Move in confirmed by both of you.</p>
      ) : meDone ? (
        <p>You confirmed. Waiting for the {mine ? "owner" : "tenant"} to confirm.</p>
      ) : (
        <button
          type="button"
          disabled={busy}
          className={btnSmallPrimary}
          data-testid="confirm-move-in"
          onClick={() => {
            setBusy(true);
            setError("");
            void confirmMoveIn({ data: { applicationId } })
              .then(() => {
                reload();
                extra?.();
              })
              .catch((e) => setError(errText(e)))
              .finally(() => setBusy(false));
          }}
        >
          Confirm move in
        </button>
      )}
      {error ? <p className={`mt-2 ${errorBox}`} role="alert">{error}</p> : null}
    </div>
  );
}
