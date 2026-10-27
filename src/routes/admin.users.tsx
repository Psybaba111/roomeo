import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import { adminSetUser, adminUsers } from "@/lib/roomsetu/admin-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/users")({
  head: () => pageHead("People · Operator", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin/users">
      <People />
    </NeedAccount>
  ),
});

function People() {
  const { user } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminUsers>>>([]);
  const [error, setError] = useState("");
  function load() {
    void adminUsers().then(setRows).catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">People</h1>
      <p className="mt-2 text-sm text-muted">Mobile numbers are visible only here, for moderation. Sample profiles are marked.</p>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {row.name} {row.isDemo ? <span className="text-xs font-medium text-muted">Sample</span> : null}
                </p>
                <p className="text-sm text-muted">{row.city} · {row.occupation} · {row.intent} · {row.verification} · {row.status}</p>
                <p className="text-sm text-muted">{row.roles} · {row.mobile}</p>
              </div>
              {!row.isDemo ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="h-9 rounded-full border border-line px-3 text-sm" onClick={() => void adminSetUser({ data: { id: row.id, action: row.status === "SUSPENDED" ? "restore" : "suspend" } }).then(load)}>
                    {row.status === "SUSPENDED" ? "Restore" : "Suspend"}
                  </button>
                  <button type="button" className="h-9 rounded-full border border-line px-3 text-sm" onClick={() => void adminSetUser({ data: { id: row.id, action: "verify" } }).then(load)}>Verify</button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </AdminFrame>
  );
}
