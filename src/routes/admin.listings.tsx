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
  function load() {
    void adminListings().then(setRows).catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">Rooms</h1>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
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
                <button type="button" className="h-9 rounded-full border border-line px-3 text-sm" onClick={() => void adminSetListing({ data: { id: row.id, action: "verify" } }).then(load)}>Verify</button>
                <button type="button" className="h-9 rounded-full border border-line px-3 text-sm" onClick={() => void adminSetListing({ data: { id: row.id, action: "reject" } }).then(load)}>Reject</button>
                <button type="button" className="h-9 rounded-full border border-line px-3 text-sm" onClick={() => void adminSetListing({ data: { id: row.id, action: "feature" } }).then(load)}>Feature</button>
                <button type="button" className="h-9 rounded-full px-3 text-sm text-danger" onClick={() => void adminSetListing({ data: { id: row.id, action: "remove" } }).then(load)}>Remove</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </AdminFrame>
  );
}
