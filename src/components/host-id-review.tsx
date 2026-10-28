import { useEffect, useState } from "react";
import { getHostReview, submitHostId } from "@/lib/roomsetu/host-review-api";
import { ID_DOC_TYPES } from "@/lib/roomsetu/host-review";
import { errText } from "@/lib/ui-text";
import { btnDark, errorBox, input } from "@/components/ui-tokens";

const TONE = {
  ok: "bg-pop-soft text-pop",
  wait: "bg-marigold-soft text-ink",
  bad: "border border-danger text-danger",
  none: "border border-line text-muted",
} as const;

/** Host-facing manual ID review: status line plus a submit form. */
export function HostIdReview() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getHostReview>> | null>(null);
  const [docType, setDocType] = useState("AADHAAR");
  const [last4, setLast4] = useState("");
  const [nameOnId, setNameOnId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function load() {
    void getHostReview()
      .then(setData)
      .catch((e) => setError(errText(e)));
  }
  useEffect(load, []);
  if (!data) return null;
  const canSubmit = data.identityStatus !== "VERIFIED" && data.reviewStatus !== "PENDING";
  return (
    <section className="mt-10 max-w-xl" aria-labelledby="id-review-h">
      <h2 id="id-review-h" className="text-2xl font-semibold">
        No DigiLocker? Get approved by the roomeo team
      </h2>
      <p
        className={`mt-3 rounded-lg px-4 py-3 text-sm font-semibold ${TONE[data.message.tone]}`}
        data-testid="id-review-status"
      >
        {data.message.text}
      </p>
      {canSubmit ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            void submitHostId({ data: { docType, last4, nameOnId } })
              .then(load)
              .catch((err) => setError(errText(err)))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block">
            <span className="mb-2 block text-sm text-muted">ID type</span>
            <select
              className={input}
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {ID_DOC_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-muted">
              Last 4 characters of the ID (we never store the full number)
            </span>
            <input
              className={input}
              value={last4}
              maxLength={4}
              onChange={(e) => setLast4(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))}
              placeholder="1234"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-muted">Name exactly as on the ID</span>
            <input
              className={input}
              value={nameOnId}
              onChange={(e) => setNameOnId(e.target.value)}
            />
          </label>
          {error ? (
            <p className={errorBox} role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className={btnDark}
          >
            Submit for review
          </button>
          <p className="text-xs text-muted">
            The team may message you on roomeo to confirm the ID before approving.
          </p>
        </form>
      ) : null}
    </section>
  );
}
