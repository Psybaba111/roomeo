import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/components/shell";
import { adminPayments, adminReviewPayment } from "@/lib/roomsetu/admin-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/payments")({
  component: () => (
    <NeedAccount next="/admin/payments">
      <Payments />
    </NeedAccount>
  ),
});

function Payments() {
  const { user } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminPayments>>>([]);
  const [error, setError] = useState("");
  function load() {
    void adminPayments().then(setRows).catch((e) => setError(errText(e)));
  }
  function review(id: string, decision: "APPROVE" | "REJECT") {
    setError("");
    void adminReviewPayment({ data: { id, decision } }).then(load).catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">UPI payments</h1>
      <p className="mt-2 text-sm text-muted">Approve only after you see the matching UTR and amount in the bank or UPI app statement.</p>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">{row.name} · ₹{row.amount} · {row.purpose} · {row.status}</p>
            <p className="text-sm text-muted">Ref <span className="font-mono">{row.ref}</span> · UTR <span className="font-mono">{row.utr}</span> · {row.submittedAt ? new Date(row.submittedAt).toLocaleString("en-IN") : ""}</p>
            {row.status === "SUBMITTED" ? (
              <div className="mt-2 flex gap-2">
                <button type="button" className="h-9 rounded-full bg-brand px-3 text-sm text-card" onClick={() => review(row.id, "APPROVE")}>Approve</button>
                <button type="button" className="h-9 rounded-full border border-line px-3 text-sm" onClick={() => review(row.id, "REJECT")}>Reject</button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="mt-4 text-muted">No UPI submissions yet.</p> : null}
    </AdminFrame>
  );
}
