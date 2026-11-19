import { adminBeforeLoad } from "@/lib/roomsetu/admin-gate-api";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import { adminFlagged, adminMarkFlagReviewed, adminSetListing } from "@/lib/roomsetu/admin-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ACTIVE_LISTING_CAP, FLAG_LABEL, type FlagReason } from "@/lib/roomsetu/owner-only";

export const Route = createFileRoute("/admin/flags")({
  beforeLoad: adminBeforeLoad,
  head: () => pageHead("Owner checks · Operator", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin/flags">
      <Flags />
    </NeedAccount>
  ),
});

type Data = Awaited<ReturnType<typeof adminFlagged>>;
const chip = "inline-flex h-8 items-center rounded-full border border-line bg-paper px-3 text-xs font-semibold";
const btn = "h-10 rounded-full border border-line bg-card px-4 text-sm font-semibold transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";

function Flags() {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  function load() {
    void adminFlagged().then(setData).catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError("");
    setNote("");
    void fn().then(() => { setNote(done); load(); }).catch((e) => setError(errText(e))).finally(() => setBusy(""));
  }
  const reviewed = (targetType: "account" | "listing", targetId: string, reason: FlagReason) =>
    run(`${targetType}:${targetId}:${reason}`, () => adminMarkFlagReviewed({ data: { targetType, targetId, reason } }), "Marked as reviewed.");
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl [text-wrap:balance]">Owner checks</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted [text-wrap:pretty]">
        Accounts and beds that might be a broker. Flags only: nobody is blocked by this list. Beds over the {ACTIVE_LISTING_CAP} live bed cap wait here until you put them live.
      </p>
      {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
      {note ? <p className="mt-3 text-sm text-brand" role="status">{note}</p> : null}
      {!data && !error ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl border border-line bg-card motion-reduce:animate-none" />)}
        </div>
      ) : null}
      {data ? (
        <>
          <h2 className="mt-8 font-display text-2xl" data-testid="flagged-listings-title">Beds · {data.listings.length}</h2>
          {data.listings.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing to review.</p> : null}
          <ul className="mt-3 space-y-3" data-testid="flagged-listings">
            {data.listings.map((l) => (
              <li key={l.id} className="rounded-2xl border border-line bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to="/listing/$id" params={{ id: l.id }} className="font-semibold [text-wrap:pretty]">{l.title}</Link>
                  <span className={chip}>{l.status}</span>
                </div>
                <p className="mt-1 text-sm text-muted">Owner: {l.owner || l.ownerId}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {l.reasons.map((r, i) => (
                    <li key={r} className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-semibold">{FLAG_LABEL[r]}</span> · {l.detail[i]}</span>
                      {r === "PENDING_REVIEW" ? null : (
                        <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => reviewed("listing", l.id, r)}>Mark reviewed</button>
                      )}
                    </li>
                  ))}
                </ul>
                {l.status === "PENDING_REVIEW" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => run(`go:${l.id}`, () => adminSetListing({ data: { id: l.id, action: "activate", reason: "owner checks: approved over cap" } }), "Bed is live.")}>Put live</button>
                    <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => run(`rm:${l.id}`, () => adminSetListing({ data: { id: l.id, action: "remove", reason: "owner checks: broker" } }), "Bed removed.")}>Remove</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <h2 className="mt-8 font-display text-2xl" data-testid="flagged-accounts-title">Accounts · {data.accounts.length}</h2>
          {data.accounts.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing to review.</p> : null}
          <ul className="mt-3 space-y-3" data-testid="flagged-accounts">
            {data.accounts.map((a) => (
              <li key={a.userId} className="rounded-2xl border border-line bg-card p-4">
                <p className="font-semibold">{a.name || a.userId}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {a.reasons.map((r, i) => (
                    <li key={r} className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-semibold">{FLAG_LABEL[r]}</span> · {a.detail[i]}</span>
                      <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => reviewed("account", a.userId, r)}>Mark reviewed</button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </AdminFrame>
  );
}
