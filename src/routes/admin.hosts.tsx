import { adminBeforeLoad } from "@/lib/roomsetu/admin-gate-api";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import { adminDecideHost, adminHostQueue } from "@/lib/roomsetu/host-review-api";
import { ID_DOC_TYPES } from "@/lib/roomsetu/host-review";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/hosts")({
  beforeLoad: adminBeforeLoad,
  head: () => pageHead("Host ID review · Operator", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin/hosts">
      <Hosts />
    </NeedAccount>
  ),
});

const BADGE: Record<string, string> = {
  PENDING: "bg-marigold-soft text-ink",
  APPROVED: "bg-brand text-card",
  REJECTED: "bg-danger text-card",
  "": "border border-line text-muted",
};

function docLabel(v: string) {
  return ID_DOC_TYPES.find((d) => d.value === v)?.label ?? (v || "—");
}

function Hosts() {
  const { user } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminHostQueue>>>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  function load() {
    void adminHostQueue()
      .then((r) => {
        setRows(r);
        setLoaded(true);
      })
      .catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  function decide(userId: string, decision: "APPROVE" | "REJECT") {
    setError("");
    setBusy(userId);
    void adminDecideHost({ data: { userId, decision, reason: reasons[userId] ?? "" } })
      .then(load)
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(""));
  }
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">Host ID review</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Hosts who are not ID-verified yet. Check the details against the host before approving.
        Approval lets them publish beds and is recorded as a roomeo team check, not a DigiLocker
        check.
      </p>
      {error ? (
        <p className="mt-3 text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li
            key={row.userId}
            className="rounded-2xl border border-line bg-card p-4"
            data-testid="host-row"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{row.name || "Unnamed host"}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[row.reviewStatus] ?? BADGE[""]}`}
              >
                {row.reviewStatus || "NOT SUBMITTED"}
              </span>
              {row.fastTrack ? (
                <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-card" data-testid="fast-track-badge">
                  Fast track
                </span>
              ) : null}
              {row.identityStatus === "VERIFIED" ? (
                <span className="rounded-full bg-pop-soft px-2 py-0.5 text-xs font-semibold text-pop">
                  Can publish
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted">
              {row.email || "no email"} · {row.city || "city not set"} · phone{" "}
              {row.phoneVerified ? "verified" : "not verified"} · {row.listings} listing
              {row.listings === 1 ? "" : "s"}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">ID type</dt>
                <dd className="font-semibold">{docLabel(row.docType)}</dd>
              </div>
              <div>
                <dt className="text-muted">Last 4</dt>
                <dd className="font-mono font-semibold">{row.last4 ? `••••${row.last4}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Name on ID</dt>
                <dd className="font-semibold">{row.nameOnId || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Submitted</dt>
                <dd className="font-semibold">
                  {row.submittedAt
                    ? new Date(row.submittedAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </dd>
              </div>
            </dl>
            {row.note ? <p className="mt-2 text-sm">Note: {row.note}</p> : null}
            {row.identityStatus !== "VERIFIED" || row.identitySource === "STAFF" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  className="h-10 min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 text-sm"
                  placeholder="Reason (required to reject)"
                  aria-label={`Reason for ${row.name}`}
                  value={reasons[row.userId] ?? ""}
                  onChange={(e) => setReasons({ ...reasons, [row.userId]: e.target.value })}
                />
                {row.identityStatus !== "VERIFIED" ? (
                  <button
                    type="button"
                    disabled={busy === row.userId || row.reviewStatus !== "PENDING"}
                    className="h-10 rounded-full bg-brand px-4 text-sm font-semibold text-card disabled:opacity-40"
                    onClick={() => decide(row.userId, "APPROVE")}
                  >
                    Approve ID
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy === row.userId}
                  className="h-10 rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-40"
                  onClick={() => decide(row.userId, "REJECT")}
                >
                  Reject
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {loaded && rows.length === 0 ? (
        <p className="mt-4 text-muted">No hosts waiting. Queue is clear.</p>
      ) : null}
    </AdminFrame>
  );
}
