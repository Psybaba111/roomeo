import { adminBeforeLoad } from "@/lib/roomsetu/admin-gate-api";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import { adminListings, adminSetListing } from "@/lib/roomsetu/admin-api";
import { inr } from "@/lib/roomsetu/map";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/listings")({
  beforeLoad: adminBeforeLoad,
  head: () => pageHead("Rooms · Operator", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin/listings">
      <Rooms />
    </NeedAccount>
  ),
});

function Rooms() {
  const { user } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListings>>>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  function act(row: { id: string; ownerIsMe: boolean }, action: "verify" | "reject" | "feature" | "remove" | "pause" | "activate") {
    let reason = "";
    if (row.ownerIsMe && (action === "verify" || action === "feature")) {
      reason = window.prompt("This is your own listing. As super admin you can self-review with a reason (goes in the audit log):") ?? "";
      if (!reason.trim()) return;
    }
    if (action === "remove" && !window.confirm("Remove this listing? It disappears from search.")) return;
    setBusy(row.id + action);
    setError("");
    setNotice("");
    void adminSetListing({ data: { id: row.id, action, reason } })
      .then((r) => {
        setNotice(r.message);
        load();
      })
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(""));
  }
  function load() {
    void adminListings().then(setRows).catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">Rooms</h1>
      {error ? <p role="alert" className="mt-3 rounded-2xl border border-line bg-card p-3 font-semibold text-danger">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 rounded-2xl border border-line bg-card p-3 font-semibold text-brand">{notice}</p> : null}
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link to="/listing/$id" params={{ id: row.id }} className="font-semibold">{row.title}</Link>
                <p className="text-sm text-muted">
                  {row.host} · {row.city} · {inr(row.rent)} · {row.status} · {row.verification}
                  {row.duplicate ? " · possible duplicate" : ""} {row.isDemo ? "· Sample" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/edit-listing/$id" params={{ id: row.id }} className="inline-flex h-9 items-center rounded-full bg-ink px-3 text-sm font-semibold text-card">Edit</Link>
                {row.status === "REMOVED" ? null : row.status === "ACTIVE" ? (
                  <button type="button" disabled={busy !== ""} className="h-9 rounded-full border border-line px-3 text-sm disabled:opacity-60" onClick={() => act(row, "pause")}>Pause</button>
                ) : (
                  <button type="button" disabled={busy !== ""} className="h-9 rounded-full bg-brand px-3 text-sm font-semibold text-card disabled:opacity-60" onClick={() => act(row, "activate")}>Go live</button>
                )}
                <button type="button" disabled={busy !== ""} className="h-9 rounded-full border border-line px-3 text-sm disabled:opacity-60" onClick={() => act(row, "verify")}>Verify</button>
                <button type="button" disabled={busy !== ""} className="h-9 rounded-full border border-line px-3 text-sm disabled:opacity-60" onClick={() => act(row, "reject")}>Reject</button>
                <button type="button" disabled={busy !== ""} className="h-9 rounded-full border border-line px-3 text-sm disabled:opacity-60" onClick={() => act(row, "feature")}>Feature</button>
                <button type="button" disabled={busy !== ""} className="h-9 rounded-full px-3 text-sm text-danger disabled:opacity-60" onClick={() => act(row, "remove")}>Remove</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </AdminFrame>
  );
}
