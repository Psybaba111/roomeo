import { adminBeforeLoad } from "@/lib/roomsetu/admin-gate-api";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import { readableDate, istToday } from "@/lib/roomsetu/dates";
import { commissionLine, refundInr, type CommissionStatus } from "@/lib/roomsetu/owner-fee";
import { adminCommissions, adminMarkCommissionPaid, adminRecordCommissionRefund, adminRecordEarlyExit, adminSetFoundingPartner } from "@/lib/roomsetu/owner-fee-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/commissions")({
  beforeLoad: adminBeforeLoad,
  head: () => pageHead("Owner commissions · Operator", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin/commissions">
      <Commissions />
    </NeedAccount>
  ),
});

type Data = Awaited<ReturnType<typeof adminCommissions>>;
const BADGE: Record<string, string> = { due: "bg-marigold-soft text-ink", due_50: "bg-marigold-soft text-ink", paid: "bg-brand text-card", refunded_50: "border border-line text-muted" };
const LABEL: Record<string, string> = { due: "Due", due_50: "Early exit · 50% due", paid: "Paid", refunded_50: "50% refunded" };
const input = "h-10 min-w-0 rounded-full border border-line bg-transparent px-4 text-sm";
const btn = "h-10 rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-40";

function Commissions() {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<CommissionStatus | "">("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState<Record<string, { date?: string; ref?: string; vacated?: string; exit?: string }>>({});
  const [host, setHost] = useState({ ownerId: "", until: "", note: "" });
  const today = istToday();
  function load() {
    void adminCommissions({ data: { status: filter || undefined } })
      .then(setData)
      .catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);
  function run(key: string, p: Promise<unknown>) {
    setError("");
    setBusy(key);
    void p.then(load).catch((e) => setError(errText(e))).finally(() => setBusy(""));
  }
  const f = (id: string) => form[id] ?? {};
  const st = data?.state;
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">Owner commissions</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Owners pay 20% of one month's rent (15% for founding partners) for each tenant (each bed) who moves in within 60 days of their first enquiry.
        Due 7 days after move-in. Tenants pay nothing. Tenant left within 15 days: record an early exit if unpaid (50% due) or a 50% refund if paid.
        Payment links are stubs in this build: no real Razorpay link is created.
      </p>
      {st ? (
        <p className="mt-3 rounded-2xl border border-line bg-card p-3 text-sm" data-testid="owner-fee-state">
          Owner fee {st.active ? "ON" : "OFF"} (OWNER_FEE_ENABLED {st.flag ? "on" : "off"}) · GST on commission {st.gstPct ? `${st.gstPct}%` : "off"} (OWNER_FEE_GST_ENABLED) · tenant fee {st.tenantFeeOn ? "ON" : "OFF"} (from {st.tenantFeeSource})
          {st.blockedByTenantFee ? " · OWNER_FEE_ENABLED is on but the tenant success fee is also on, so no commissions are created (no double charge). Set ROOMEO_TENANT_FEE_ENABLED=false to switch models." : ""}
        </p>
      ) : null}
      {data && !data.migrated ? <p className="mt-3 text-danger">Migration 0027 isn't applied on this database yet.</p> : null}
      {error ? <p className="mt-3 text-danger" role="alert">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {(["", "due", "due_50", "paid", "refunded_50"] as const).map((s) => (
          <button key={s || "all"} type="button" className={`${btn} ${filter === s ? "bg-ink text-card" : ""}`} onClick={() => setFilter(s)}>
            {s ? LABEL[s] : "All"}
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-3">
        {(data?.items ?? []).map((c) => (
          <li key={c.id} className="rounded-2xl border border-line bg-card p-4" data-testid="commission-row">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{c.ownerName} · {c.listingTitle}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[c.status] ?? ""}`}>{LABEL[c.status] ?? c.status}</span>
              {c.founding ? <span className="rounded-full bg-pop-soft px-2 py-0.5 text-xs font-semibold text-pop">Founding 15%</span> : null}
              {c.squad ? <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold">Squad bed</span> : null}
              {(c.status === "due" || c.status === "due_50") && c.dueOn < today ? <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-card">Overdue</span> : null}
            </div>
            <p className="mt-1 text-sm">{commissionLine(c)}</p>
            {c.earlyExit && c.status !== "due_50" ? <p className="mt-1 text-sm text-muted">Early exit: tenant moved out {readableDate(c.vacatedOn)}, so only 50% (₹{c.amountDueInr}) was due</p> : null}
            {c.status === "due_50" ? <p className="mt-1 text-sm font-semibold">Tenant moved out {readableDate(c.vacatedOn)}: ₹{c.amountDueInr} due (50%)</p> : null}
            <p className="mt-1 text-sm text-muted">
              Tenant {c.tenantName} · first enquiry {readableDate(c.firstEnquiryAt)} · moved in {readableDate(c.moveInOn)} (day {c.attributionDays}) · due {readableDate(c.dueOn)} · link {c.paymentLinkMode}:{c.paymentLinkRef}
            </p>
            {c.paidOn ? <p className="mt-1 text-sm text-muted">Paid ₹{c.paidInr} on {readableDate(c.paidOn)} {c.paidRef}</p> : null}
            {c.refundedOn ? <p className="mt-1 text-sm text-muted">Moved out {readableDate(c.vacatedOn)} · ₹{c.refundInr} refunded {readableDate(c.refundedOn)} {c.refundRef}</p> : null}
            {c.status === "due" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-sm">Tenant moved out <input type="date" className={input} value={f(c.id).exit ?? ""} onChange={(e) => setForm({ ...form, [c.id]: { ...f(c.id), exit: e.target.value } })} /></label>
                <button type="button" className={btn} disabled={busy === c.id || !f(c.id).exit} onClick={() => run(c.id, adminRecordEarlyExit({ data: { id: c.id, vacatedOn: f(c.id).exit ?? "" } }))}>
                  Record early exit (owner owes 50%)
                </button>
              </div>
            ) : null}
            {c.status === "due" || c.status === "due_50" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input type="date" className={input} aria-label="Paid on" value={f(c.id).date ?? today} onChange={(e) => setForm({ ...form, [c.id]: { ...f(c.id), date: e.target.value } })} />
                <input className={input} placeholder="Payment ref" aria-label="Payment ref" value={f(c.id).ref ?? ""} onChange={(e) => setForm({ ...form, [c.id]: { ...f(c.id), ref: e.target.value } })} />
                <button type="button" className={btn} disabled={busy === c.id} onClick={() => run(c.id, adminMarkCommissionPaid({ data: { id: c.id, paidOn: f(c.id).date ?? today, ref: f(c.id).ref ?? "" } }))}>
                  Mark ₹{c.amountDueInr} paid
                </button>
              </div>
            ) : null}
            {c.status === "paid" && !c.earlyExit ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-sm">Moved out <input type="date" className={input} value={f(c.id).vacated ?? ""} onChange={(e) => setForm({ ...form, [c.id]: { ...f(c.id), vacated: e.target.value } })} /></label>
                <label className="text-sm">Refunded <input type="date" className={input} value={f(c.id).date ?? today} onChange={(e) => setForm({ ...form, [c.id]: { ...f(c.id), date: e.target.value } })} /></label>
                <input className={input} placeholder="Refund ref" aria-label="Refund ref" value={f(c.id).ref ?? ""} onChange={(e) => setForm({ ...form, [c.id]: { ...f(c.id), ref: e.target.value } })} />
                <button type="button" className={btn} disabled={busy === c.id || !f(c.id).vacated}
                  onClick={() => run(c.id, adminRecordCommissionRefund({ data: { id: c.id, vacatedOn: f(c.id).vacated ?? "", refundedOn: f(c.id).date ?? today, ref: f(c.id).ref ?? "" } }))}>
                  Record 50% refund (₹{refundInr(c.feeInr, c.gstInr)})
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {data && data.items.length === 0 ? <p className="mt-4 text-muted">No commissions here.</p> : null}

      <h2 className="mt-10 text-2xl font-semibold">Founding partners</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">Set by hand (for example, an owner who brought 2 more PGs). 15% instead of 20% on move-ins up to the end date. The end date defaults to 6 months from today.</p>
      <ul className="mt-3 space-y-1 text-sm">
        {(data?.founding ?? []).map((h) => (
          <li key={h.owner_id} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{h.full_name || h.owner_id}</span> until {readableDate(h.founding_until)} {h.note ? `· ${h.note}` : ""}
            <button type="button" className={btn} disabled={busy === h.owner_id} onClick={() => run(h.owner_id, adminSetFoundingPartner({ data: { ownerId: h.owner_id, on: false } }))}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input className={input} placeholder="Host user id" aria-label="Host user id" value={host.ownerId} onChange={(e) => setHost({ ...host, ownerId: e.target.value.trim() })} />
        <input type="date" className={input} aria-label="Founding end date" value={host.until} onChange={(e) => setHost({ ...host, until: e.target.value })} />
        <input className={input} placeholder="Note (why)" aria-label="Note" value={host.note} onChange={(e) => setHost({ ...host, note: e.target.value })} />
        <button type="button" className={btn} disabled={!host.ownerId || busy === "host"} onClick={() => run("host", adminSetFoundingPartner({ data: { ownerId: host.ownerId, on: true, until: host.until || null, note: host.note } }))}>
          Make founding partner
        </button>
      </div>
    </AdminFrame>
  );
}
