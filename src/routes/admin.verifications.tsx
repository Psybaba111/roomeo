import { adminBeforeLoad } from "@/lib/roomsetu/admin-gate-api";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import { adminSetCheck, adminVerifications } from "@/lib/roomsetu/admin-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/verifications")({
  beforeLoad: adminBeforeLoad,
  head: () => pageHead("Checks · Operator", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin/verifications">
      <Checks />
    </NeedAccount>
  ),
});

function Checks() {
  const { user } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminVerifications>>>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  function decide(id: string, status: "VERIFIED" | "REJECTED") {
    setError("");
    setBusy(id);
    void adminSetCheck({ data: { id, status } })
      .then(load)
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(""));
  }
  function load() {
    void adminVerifications().then(setRows).catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">Verification queue</h1>
      <p className="mt-2 text-sm text-muted">Approve only checks you have actually reviewed. Sample rows are from the demo seed.</p>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">{row.name} · {row.kind} {row.isDemo ? "· Sample" : ""}</p>
            <p className="text-sm text-muted">{row.note}</p>
            {row.kind === "IDENTITY" ? (
              <a href="/admin/hosts" className="mt-2 inline-block text-sm font-semibold text-brand underline-offset-4 hover:underline">
                Review ID details in Host ID review →
              </a>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="h-10 rounded-full bg-brand px-4 text-sm text-card disabled:opacity-40" disabled={busy === row.id} onClick={() => decide(row.id, "VERIFIED")}>{row.kind === "IDENTITY" ? "Desk pass" : "Approve"}</button>
              <button type="button" className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-40" disabled={busy === row.id} onClick={() => decide(row.id, "REJECTED")}>Reject</button>
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="mt-4 text-muted">Queue is clear.</p> : null}
    </AdminFrame>
  );
}
