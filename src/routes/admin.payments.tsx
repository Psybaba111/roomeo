import { adminBeforeLoad } from "@/lib/roomsetu/admin-gate-api";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import {
  adminMarkRefunded,
  adminPayments,
  adminRefunds,
  adminReviewPayment,
} from "@/lib/roomsetu/admin-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { btnSmallPrimary, card, input } from "@/components/ui-tokens";

export const Route = createFileRoute("/admin/payments")({
  beforeLoad: adminBeforeLoad,
  head: () => pageHead("Payments · Operator", { noindex: true }),
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
  const [refunds, setRefunds] = useState<Awaited<ReturnType<typeof adminRefunds>>>([]);
  const [refundUtr, setRefundUtr] = useState<Record<string, string>>({});
  function load() {
    void adminPayments()
      .then(setRows)
      .catch((e) => setError(errText(e)));
    void adminRefunds()
      .then(setRefunds)
      .catch(() => undefined);
  }
  function review(id: string, decision: "APPROVE" | "REJECT") {
    setError("");
    void adminReviewPayment({ data: { id, decision } })
      .then(load)
      .catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">UPI payments</h1>
      <p className="mt-2 text-sm text-muted">
        Approve only after you see the matching UTR and amount in the bank or UPI app statement.
      </p>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">
              {row.name} · ₹{row.amount} · {row.purpose} · {row.status}
            </p>
            <p className="text-sm text-muted">
              Ref <span className="font-mono">{row.ref}</span> · UTR{" "}
              <span className="font-mono">{row.utr}</span> ·{" "}
              {row.submittedAt ? new Date(row.submittedAt).toLocaleString("en-IN") : ""}
            </p>
            {row.status === "SUBMITTED" ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="h-9 rounded-full bg-brand px-3 text-sm text-card"
                  onClick={() => review(row.id, "APPROVE")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="h-9 rounded-full border border-line px-3 text-sm"
                  onClick={() => review(row.id, "REJECT")}
                >
                  Reject
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="mt-4 text-muted">No UPI submissions yet.</p> : null}
      <section className="mt-10" aria-labelledby="refunds-h">
        <h2 className="text-2xl font-semibold" id="refunds-h">
          Refunds
        </h2>
        <p className="mt-2 text-sm text-muted [text-wrap:pretty]">
          Money owed back: passes covered by the refund promise, and old contact fees where the owner declined. Send the amount to the payer's UPI ID
          from roomeo's UPI app, then record the refund UTR here. No refund is owed once the owner
          accepted, or when the seeker withdrew or left.
        </p>
        <ul className="mt-4 space-y-4" data-testid="refunds">
          {refunds.map((r) => (
            <li key={r.id} className={card} data-testid="refund-row">
              <p className="text-base font-semibold">
                {r.name} · ₹{r.amount} · {r.status === "REFUND_DUE" ? "Refund due" : "Refunded"}
              </p>
              <p className="mt-1 text-sm text-muted">
                Pay to{" "}
                <span className="font-mono font-semibold text-ink">
                  {r.payerVpa || "no UPI ID given, contact the payer"}
                </span>{" "}
                · {r.purpose}
              </p>
              <p className="text-sm text-muted">
                Ref <span className="font-mono">{r.ref}</span> · paid UTR{" "}
                <span className="font-mono">{r.utr}</span>
                {r.reason ? ` · ${r.reason}` : ""}
                {r.refundUtr ? ` · refund UTR ${r.refundUtr}` : ""}
              </p>
              {r.status === "REFUND_DUE" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <input
                    className={`${input} h-10 min-w-0 flex-1 text-sm`}
                    inputMode="numeric"
                    placeholder="Refund UTR, 12 digits"
                    aria-label={`Refund UTR for ${r.ref}`}
                    value={refundUtr[r.id] ?? ""}
                    onChange={(e) => setRefundUtr({ ...refundUtr, [r.id]: e.target.value })}
                  />
                  <button
                    type="button"
                    className={btnSmallPrimary}
                    onClick={() => {
                      setError("");
                      void adminMarkRefunded({ data: { id: r.id, utr: refundUtr[r.id] ?? "" } })
                        .then(load)
                        .catch((e) => setError(errText(e)));
                    }}
                  >
                    Mark refunded
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {refunds.length === 0 ? (
          <p className={`mt-4 text-sm text-muted ${card}`}>
            No refunds owed right now. Passes covered by the refund promise show up here.
          </p>
        ) : null}
      </section>
    </AdminFrame>
  );
}
