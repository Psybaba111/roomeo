import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { readableDate } from "@/lib/roomsetu/dates";
import { commissionLine } from "@/lib/roomsetu/owner-fee";
import { getMyCommissions, getMyDepositMarks, markMyDeposit, undoMyDeposit } from "@/lib/roomsetu/owner-fee-api";
import { CreditBalance } from "@/components/credit-balance";
import { istToday } from "@/lib/roomsetu/dates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/owner-fees")({
  head: () => pageHead("Roomeo commissions", { noindex: true }),
  component: () => (
    <NeedAccount next="/owner-fees">
      <OwnerFees />
    </NeedAccount>
  ),
});

const LABEL: Record<string, string> = { due: "Due", due_50: "Tenant left early · 50% due", paid: "Paid", refunded_50: "50% refunded", waived: "₹0 · founding partner", void: "Cancelled · nothing owed" };

function OwnerFees() {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof getMyCommissions>> | null>(null);
  const [error, setError] = useState("");
  const [marks, setMarks] = useState<Awaited<ReturnType<typeof getMyDepositMarks>> | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [undoWhy, setUndoWhy] = useState<Record<string, string>>({});
  const [recvOn, setRecvOn] = useState<Record<string, string>>({});
  const load = () => {
    void getMyCommissions().then(setData).catch((e) => setError(errText(e)));
    void getMyDepositMarks().then(setMarks).catch((e) => setError(errText(e)));
  };
  useEffect(() => {
    if (user) load();
  }, [user]);
  function run(key: string, p: Promise<unknown>, done: (r: unknown) => string) {
    setError("");
    setNote("");
    setBusy(key);
    void p
      .then((r) => {
        setNote(done(r));
        load();
      })
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(""));
  }
  const today = istToday();
  const v = data?.view;
  const due = (data?.items ?? []).filter((c) => c.status === "due" || c.status === "due_50");
  return (
    <Shell>
      <h1 className="font-display text-4xl">Roomeo commissions</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        {v?.on
          ? `Listing is free. You pay Roomeo a flat ₹${v.flatInr}${v.gstPct ? ` (GST included)` : ""} (₹0 for founding partners) per tenant, only after you've received their deposit and rent advance, marked it below, and Roomeo has checked it. Never upfront. It's due within ${v.dueDays} days of Roomeo's check. If the tenant leaves within ${v.refundDays} days of moving in, you pay only ${v.refundPct}%. Please don't charge Roomeo tenants any brokerage.`
          : "Roomeo doesn't charge owners a commission right now."}
      </p>
      {error ? <p className="mt-3 text-danger" role="alert">{error}</p> : null}
      {note ? <p className="mt-3 font-semibold text-brand" role="status">{note}</p> : null}
      <CreditBalance />
      {marks && marks.items.length ? (
        <section className="mt-6" data-testid="deposit-marks">
          <h2 className="text-2xl font-semibold">Deposit + rent advance</h2>
          <p className="mt-1 text-sm text-muted">Tap once you've actually received the tenant's deposit and first rent advance. {marks.active ? "Roomeo then checks it; the fee starts only after that check. Marking twice never charges twice." : "Roomeo doesn't charge owners this way right now; marking just keeps your records straight."}</p>
          <ul className="mt-3 space-y-3">
            {marks.items.map((m) => {
              const st = m.mark?.state;
              const on = st === "pending" || st === "verified";
              return (
                <li key={m.applicationId} className="rounded-2xl border border-line bg-card p-4" data-testid="deposit-row">
                  <p className="font-semibold">{m.tenantName} · {m.listingTitle}</p>
                  {on ? (
                    <>
                      <p className="mt-1 text-sm">
                        {st === "verified" ? "✅" : "⏳"} Received {readableDate(m.mark!.receivedOn)} · {st === "verified" ? `checked by Roomeo ${readableDate(m.mark!.verifiedAt ?? "")}` : "waiting for Roomeo's check"}
                        {m.feeStatus ? ` · Roomeo fee: ${LABEL[m.feeStatus] ?? m.feeStatus}${m.amountDueInr != null && (m.feeStatus === "due" || m.feeStatus === "due_50") ? ` ₹${m.amountDueInr}` : ""}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <input className="h-11 min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 text-sm" aria-label="Why undo" placeholder="Why undo? (deposit returned…)" value={undoWhy[m.applicationId] ?? ""} onChange={(e) => setUndoWhy({ ...undoWhy, [m.applicationId]: e.target.value })} />
                        <button type="button" className="h-11 rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-40" disabled={!undoWhy[m.applicationId] || busy === m.applicationId} data-testid="deposit-undo"
                          onClick={() => run(m.applicationId, undoMyDeposit({ data: { applicationId: m.applicationId, reason: undoWhy[m.applicationId] ?? "" } }), () => "Mark undone. Nothing is owed for it.")}>
                          Undo
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                    {st === "rejected" ? <p className="mt-1 text-sm text-danger" data-testid="deposit-rejected">Not accepted by Roomeo: {m.mark!.rejectReason}. Nothing is due. Mark it again once it's received.</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="date" max={today} className="h-11 rounded-full border border-line bg-transparent px-4 text-sm" aria-label="Date received" value={recvOn[m.applicationId] ?? today} onChange={(e) => setRecvOn({ ...recvOn, [m.applicationId]: e.target.value })} />
                      <button type="button" className="h-11 rounded-full bg-brand px-4 text-sm font-semibold text-card disabled:opacity-40" disabled={busy === m.applicationId} data-testid="deposit-mark"
                        onClick={() => run(m.applicationId, markMyDeposit({ data: { applicationId: m.applicationId, receivedOn: recvOn[m.applicationId] ?? today } }), () => "Marked. Roomeo will check it; nothing is due until then.")}>
                        Deposit + advance received
                      </button>
                    </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {due.length ? (
        <p className="mt-4 rounded-2xl border border-line bg-card p-3 font-semibold" data-testid="commission-due-total">
          Due now: ₹{due.reduce((s, c) => s + c.amountDueInr, 0)} across {due.length} move-in{due.length === 1 ? "" : "s"}
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {(data?.items ?? []).map((c) => (
          <li key={c.id} className="rounded-2xl border border-line bg-card p-4" data-testid="owner-commission-row">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{c.listingTitle}</p>
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold">{LABEL[c.status] ?? c.status}</span>
            </div>
            <p className="mt-1 text-sm">{commissionLine(c)}</p>
            <p className="mt-1 text-sm text-muted">
              {c.tenantName} {c.trigger === "deposit" ? "deposit + advance received" : "moved in"} {readableDate(c.trigger === "deposit" ? c.basisOn : c.moveInOn)}{c.status === "due" || c.status === "due_50" ? ` · due by ${readableDate(c.dueOn)}` : ""}
              {c.creditInr > 0 ? ` · ₹${c.creditInr} Roomeo credit applied` : ""}
              {c.status === "void" ? ` · cancelled: ${c.voidReason}` : ""}
              {c.earlyExit && c.status !== "due_50" ? ` · tenant moved out ${readableDate(c.vacatedOn)}, so only 50% (₹${c.amountDueInr}) was due` : ""}
              {c.status === "due_50" ? ` · tenant moved out ${readableDate(c.vacatedOn)}, so only ₹${c.amountDueInr} (50%) is due` : ""}
              {c.status === "due" || c.status === "due_50" ? " · Roomeo will send you a Razorpay payment link" : ""}
              {c.paidOn ? ` · paid ₹${c.paidInr} on ${readableDate(c.paidOn)}` : ""}
              {c.refundedOn ? ` · ₹${c.refundInr} refunded ${readableDate(c.refundedOn)}` : ""}
            </p>
          </li>
        ))}
      </ul>
      {data && data.items.length === 0 ? <p className="mt-4 text-muted">No commissions yet.</p> : null}
    </Shell>
  );
}
