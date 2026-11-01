import { adminBeforeLoad } from "@/lib/roomsetu/admin-gate-api";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import {
  adminMarkRefunded,
  adminRecordVacate,
  adminPayments,
  adminRefunds,
  adminReviewPayment,
  adminTrialBookings,
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
  const [vacate, setVacate] = useState({ applicationId: "", vacatedOn: "" });
  const [vacateNote, setVacateNote] = useState("");
  const [trials, setTrials] = useState<Awaited<ReturnType<typeof adminTrialBookings>>>([]);
  function load() {
    void adminPayments()
      .then(setRows)
      .catch((e) => setError(errText(e)));
    void adminRefunds()
      .then(setRefunds)
      .catch(() => undefined);
    void adminTrialBookings()
      .then(setTrials)
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
              {row.invoiceNo ? (
                <>
                  {" · "}
                  <Link to="/invoice/$paymentId" params={{ paymentId: row.id }} className="underline" data-testid="admin-invoice-link">
                    GST invoice {row.invoiceNo}
                  </Link>
                </>
              ) : null}
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
      <section className="mt-10" aria-labelledby="vacate-h">
        <h2 className="text-2xl font-semibold" id="vacate-h">
          Record a move-out
        </h2>
        <p className="mt-2 text-sm text-muted [text-wrap:pretty]">
          The ₹499 + GST fee is refunded only if the renter vacates within 7 days of paying it. Enter the agreement
          and the move-out date: fees paid within 7 days before that date (renter and owner) move to Refunds below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2" data-testid="vacate-form">
          <input
            className={`${input} h-10 min-w-0 flex-1 text-sm`}
            placeholder="Application ID or squad:<request id>"
            aria-label="Agreement application ID"
            value={vacate.applicationId}
            onChange={(e) => setVacate({ ...vacate, applicationId: e.target.value })}
          />
          <input
            className={`${input} h-10 text-sm`}
            type="date"
            aria-label="Move-out date"
            value={vacate.vacatedOn}
            onChange={(e) => setVacate({ ...vacate, vacatedOn: e.target.value })}
          />
          <button
            type="button"
            className={btnSmallPrimary}
            onClick={() => {
              setError("");
              setVacateNote("");
              void adminRecordVacate({ data: vacate })
                .then((r) => {
                  setVacateNote(r.refunds ? `${r.refunds} fee payment(s) moved to Refunds.` : "Recorded. No fee was paid within 7 days of that date, so no refund.");
                  load();
                })
                .catch((e) => setError(errText(e)));
            }}
          >
            Record move-out
          </button>
        </div>
        {vacateNote ? <p className="mt-2 text-sm font-semibold" data-testid="vacate-note">{vacateNote}</p> : null}
      </section>
      <section className="mt-10" aria-labelledby="trials-h">
        <h2 className="text-2xl font-semibold" id="trials-h">
          Trial nights
        </h2>
        <p className="mt-2 text-sm text-muted [text-wrap:pretty]">
          ₹99 incl. GST (₹83.90 + ₹15.10 GST) per trial booking, approved above like any UPI payment. Stay money goes to the
          owner directly. A trial earns ₹99 off the ₹589 fee if the deal is issued within 14 days of check-out.
        </p>
        <ul className="mt-4 space-y-2" data-testid="trial-bookings">
          {trials.map((t) => (
            <li key={t.id} className={card}>
              <p className="font-semibold">
                {t.seeker} at {t.title || t.listingId} · {t.checkIn} · {t.nights} night(s) · {t.status}
              </p>
              <p className="text-sm text-muted">
                Owner {t.owner} · stay ₹{t.nightlyInr} × {t.nights} = ₹{t.stayTotalInr} (paid to owner) · fee{" "}
                <span className="font-mono">{t.feeRef}</span> {t.feeStatus} · ID {t.idCheckedAt ? "checked" : "not checked yet"}
                {t.creditedOn ? ` · ₹99 credited on ${t.creditedOn}` : ""}
              </p>
            </li>
          ))}
        </ul>
        {trials.length === 0 ? <p className={`mt-4 text-sm text-muted ${card}`}>No trial bookings yet.</p> : null}
      </section>
      <section className="mt-10" aria-labelledby="refunds-h">
        <h2 className="text-2xl font-semibold" id="refunds-h">
          Refunds
        </h2>
        <p className="mt-2 text-sm text-muted [text-wrap:pretty]">
          Money owed back: platform fees where the renter vacated within 7 days of paying, passes covered by the refund promise, and old contact fees where the owner declined. Send the amount to the payer's UPI ID
          from roomeo's UPI app, then record the refund UTR here. No refund is owed once the owner
          accepted, or for a fee once the stay lasted past 7 days from payment.
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
