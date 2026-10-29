import { useEffect, useState } from "react";
import { getHostReview, submitHostId } from "@/lib/roomsetu/host-review-api";
import { formatIst, ID_DOC_TYPES, idReviewView } from "@/lib/roomsetu/host-review";
import { errText } from "@/lib/ui-text";
import { btnDark, btnSmall, errorBox, input, skeleton } from "@/components/ui-tokens";
import { idReviewHeading } from "@/lib/roomsetu/verification-copy";
import { FastTrackOffer } from "@/components/host-extras";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

/** Host-facing manual ID review: saved status from the server, form only when there's something to submit. */
export function HostIdReview({
  digilockerReady,
  phoneVerified = false,
  onChange,
}: { digilockerReady?: boolean; phoneVerified?: boolean; onChange?: () => void } = {}) {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof getHostReview>> | null>(null);
  const [loadError, setLoadError] = useState("");
  const [docType, setDocType] = useState("AADHAAR");
  const [last4, setLast4] = useState("");
  const [nameOnId, setNameOnId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);
  function load() {
    setLoadError("");
    return getHostReview()
      .then((d) => {
        setData(d);
        if (d.docType) setDocType(d.docType);
        if (d.nameOnId && !nameOnId) setNameOnId(d.nameOnId);
      })
      .catch((e) => setLoadError(errText(e)));
  }
  useEffect(() => {
    if (user) void load();
  }, [user?.id]);

  const heading = (
    <h2 id="id-review-h" className="text-xl font-semibold">
      {idReviewHeading(digilockerReady)}
    </h2>
  );
  if (!data) {
    return (
      <section className="mt-6 max-w-xl" aria-labelledby="id-review-h">
        {heading}
        {loadError ? (
          <div className={`mt-3 ${errorBox}`} role="alert">
            <p>Couldn't load your ID status. {loadError}</p>
            <button type="button" className={`mt-2 ${btnSmall}`} onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : (
          <div className={`mt-3 h-14 ${skeleton}`} aria-busy="true" aria-label="Loading ID status" />
        )}
      </section>
    );
  }
  const view = idReviewView({ ...data, phoneVerified });
  return (
    <section className="mt-6 max-w-xl" aria-labelledby="id-review-h">
      {heading}
      <div role="status" aria-live="polite" data-testid="id-review-status">
        {view.kind === "approved" ? (
          <div className="mt-3 rounded-lg bg-pop-soft px-4 py-3 text-sm font-semibold text-pop">
            <p>{view.via === "DIGILOCKER" ? "ID verified with DigiLocker ✓" : "Approved ✓ the roomeo team checked your ID"}</p>
            <p className="mt-1 font-normal">
              {view.verifiedBadge ? "You've got the Verified badge. Go list that bed 🛏️" : "Verify your phone above to get the Verified badge."}
            </p>
          </div>
        ) : view.kind === "pending" ? (
          <div className="mt-3 rounded-lg bg-marigold-soft px-4 py-3 text-sm text-ink">
            <p className="font-semibold">{justSent ? "Sent ✓ " : ""}Pending review</p>
            <p className="mt-1">
              {view.docLabel} ending ••••{view.last4}
              {view.nameOnId ? ` · ${view.nameOnId}` : ""}
            </p>
            <p className="mt-1 text-muted">
              {view.submittedAt ? `Submitted ${formatIst(view.submittedAt)}. ` : ""}The team usually gets to it within a day. Nothing to do till then.
            </p>
          </div>
        ) : view.kind === "rejected" ? (
          <div className="mt-3 rounded-lg border border-danger px-4 py-3 text-sm text-danger">
            <p className="font-semibold">Rejected</p>
            <p className="mt-1">{view.reason || "The team couldn't match your details."} Fix it and submit again below.</p>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-line px-4 py-3 text-sm text-muted">
            Drop your ID details so the roomeo team can approve you to publish.
          </p>
        )}
      </div>
      {view.kind !== "approved" ? <FastTrackOffer /> : null}
      {view.showForm ? (
        <form
          className="mt-4 space-y-3"
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            setError("");
            setBusy(true);
            void submitHostId({ data: { docType, last4, nameOnId } })
              .then(async () => {
                setJustSent(true);
                setLast4("");
                await load();
                onChange?.();
              })
              .catch((err) => setError(errText(err)))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block">
            <span className="mb-2 block text-sm text-muted">ID type</span>
            <select className={input} value={docType} disabled={busy} onChange={(e) => setDocType(e.target.value)}>
              {ID_DOC_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-muted">Last 4 characters (we never store the full ID)</span>
            <input
              className={input}
              value={last4}
              maxLength={4}
              inputMode={docType === "AADHAAR" ? "numeric" : "text"}
              autoComplete="off"
              disabled={busy}
              required
              onChange={(e) => setLast4(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))}
              placeholder="1234"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-muted">Name exactly as on the ID</span>
            <input className={input} value={nameOnId} autoComplete="name" disabled={busy} required onChange={(e) => setNameOnId(e.target.value)} />
          </label>
          {error ? (
            <p className={errorBox} role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy} aria-busy={busy} className={`w-full sm:w-auto ${btnDark}`}>
            {busy ? "Submitting…" : view.kind === "rejected" ? "Submit again" : "Submit for review"}
          </button>
          <p className="text-xs text-muted">We might ping you on roomeo to double-check. Usually approved within a day.</p>
        </form>
      ) : null}
    </section>
  );
}
