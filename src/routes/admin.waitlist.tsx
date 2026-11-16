import { adminBeforeLoad } from "@/lib/roomsetu/admin-gate-api";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import { adminWaitlist } from "@/lib/roomsetu/waitlist-api";
import { waitlistCsv } from "@/lib/roomsetu/waitlist";
import { ROOMIE_TYPES, type RoomieTypeKey } from "@/lib/roomsetu/roomie-quiz";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/waitlist")({
  beforeLoad: adminBeforeLoad,
  head: () => pageHead("Waitlist · Operator", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin/waitlist">
      <Waitlist />
    </NeedAccount>
  ),
});

function Waitlist() {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof adminWaitlist>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (user) void adminWaitlist().then(setData).catch((e) => setError(errText(e)));
  }, [user]);

  function download() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([waitlistCsv(data.rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `roomeo-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">Waitlist</h1>
      <p className="mt-2 text-sm text-muted">
        Pre-launch sign-ups. Waitlist mode is <strong>{data ? (data.enabled ? "ON" : "off") : "…"}</strong> here. Contact details are for launch messages only (they consented).
      </p>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      {data ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm" data-testid="waitlist-admin-totals">
            <span className="rounded-full bg-ink px-3 py-1 font-semibold text-card">{data.total} total</span>
            <span className="rounded-full border border-line px-3 py-1">{data.byRole.tenant ?? 0} tenants</span>
            <span className="rounded-full border border-line px-3 py-1">{data.byRole.owner ?? 0} owners / hosts</span>
            <button type="button" onClick={download} disabled={!data.rows.length} className="ml-auto inline-flex h-10 items-center rounded-full bg-brand px-4 font-semibold text-card disabled:opacity-50" data-testid="waitlist-csv">
              Download CSV
            </button>
          </div>
          <ul className="mt-4 space-y-2" data-testid="waitlist-admin-list">
            {data.rows.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-card p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">{r.name}</p>
                  <span className="text-xs text-muted">{r.createdAt} IST</span>
                </div>
                <p className="mt-1 text-muted">{[r.email, r.phone].filter(Boolean).join(" · ")}</p>
                <p className="mt-1">
                  {r.city} · {r.role === "owner" ? "Owner / host" : "Tenant"}
                  {r.roomieType && ROOMIE_TYPES[r.roomieType as RoomieTypeKey] ? ` · ${ROOMIE_TYPES[r.roomieType as RoomieTypeKey].emoji} ${ROOMIE_TYPES[r.roomieType as RoomieTypeKey].name}` : ""} · {r.source}
                </p>
              </li>
            ))}
          </ul>
          {!data.rows.length ? <p className="mt-4 text-sm text-muted">No sign-ups yet.</p> : null}
        </>
      ) : null}
    </AdminFrame>
  );
}
