import { adminBeforeLoad } from "@/lib/roomsetu/admin-gate-api";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import { adminAudit, adminConversations, adminReports, adminSetReport } from "@/lib/roomsetu/admin-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/reports")({
  beforeLoad: adminBeforeLoad,
  head: () => pageHead("Reports · Operator", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin/reports">
      <Reports />
    </NeedAccount>
  ),
});

function Reports() {
  const { user } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminReports>>>([]);
  const [threads, setThreads] = useState<Awaited<ReturnType<typeof adminConversations>>>([]);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof adminAudit>>>([]);
  const [error, setError] = useState("");
  function load() {
    void Promise.all([adminReports(), adminConversations(), adminAudit()])
      .then(([r, t, a]) => {
        setRows(r);
        setThreads(t);
        setAudit(a);
      })
      .catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">Reports</h1>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">{row.category} · {row.targetType} {row.fraud ? "· fraud flag" : ""}</p>
            <p className="text-sm text-muted">{row.note} · {row.status} · {row.filed}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="h-9 rounded-full border border-line px-3 text-sm" onClick={() => void adminSetReport({ data: { id: row.id, status: "REVIEWING" } }).then(load)}>Review</button>
              <button type="button" className="h-9 rounded-full border border-line px-3 text-sm" onClick={() => void adminSetReport({ data: { id: row.id, status: "RESOLVED" } }).then(load)}>Resolve</button>
              <button type="button" className="h-9 rounded-full border border-line px-3 text-sm" onClick={() => void adminSetReport({ data: { id: row.id, status: "DISMISSED" } }).then(load)}>Dismiss</button>
            </div>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-display text-2xl">Conversation metadata</h2>
      <p className="text-sm text-muted">Counts only. Message text stays with the people in the thread.</p>
      <ul className="mt-3 space-y-1 text-sm">
        {threads.map((t) => (
          <li key={t.id} className="flex justify-between rounded-lg bg-paper px-3 py-2">
            <span>{t.title}</span>
            <span className="text-muted">{t.messages} messages · {t.updated}</span>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-display text-2xl">Audit</h2>
      <ul className="mt-3 space-y-1 text-sm">
        {audit.map((a, i) => (
          <li key={i} className="text-muted">{a.at} · {a.action} · {a.targetType}</li>
        ))}
      </ul>
    </AdminFrame>
  );
}
