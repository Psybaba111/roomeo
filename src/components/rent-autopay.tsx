import { useEffect, useState } from "react";
import { ArrowsClockwise, CheckCircle, Clock, WarningCircle, Lightning } from "@phosphor-icons/react";
import { errText } from "@/lib/ui-text";
import { CASHFREE_SDK_URL } from "@/lib/roomsetu/cashfree";
import {
  confirmRentUtr,
  createRentPlan,
  getListingRentBadge,
  getRentAutopay,
  startRentAutopay,
  startRentUpi,
  submitRentUtr,
} from "@/lib/roomsetu/rent-autopay-api";
import { btnPrimary, btnSmall, btnSmallPrimary, card, errorBox, inner, input } from "@/components/ui-tokens";

type Data = Awaited<ReturnType<typeof getRentAutopay>>;
type On = Extract<Data, { enabled: true }>;
type Upi = Awaited<ReturnType<typeof startRentUpi>>;

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function loadCashfree(): Promise<(o: { mode: string }) => { subscriptionsCheckout: (o: { subsSessionId: string; redirectTarget: string }) => Promise<{ error?: { message?: string } }> }> {
  const w = window as unknown as { Cashfree?: never };
  if (w.Cashfree) return Promise.resolve(w.Cashfree);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CASHFREE_SDK_URL;
    s.onload = () => resolve((window as unknown as { Cashfree: never }).Cashfree);
    s.onerror = () => reject(new Error("Couldn't load the AutoPay checkout. Try again?"));
    document.head.appendChild(s);
  });
}

function StatusPill({ status }: { status: string | null }) {
  if (status === "PAID")
    return <span className="inline-flex items-center gap-1 rounded-full bg-trust/10 px-3 py-1 text-sm font-semibold text-trust"><CheckCircle className="h-4 w-4" /> Paid</span>;
  if (status === "FAILED")
    return <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-3 py-1 text-sm font-semibold text-danger"><WarningCircle className="h-4 w-4" /> Failed</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-paper px-3 py-1 text-sm font-semibold text-muted"><Clock className="h-4 w-4" /> Pending</span>;
}

/** Dashboard section: renter AutoPay + owner "this month" board. Renders nothing while the flag is off. */
export function RentAutopaySection() {
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    getRentAutopay().then((d) => alive && setData(d)).catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [reload]);
  if (!data?.enabled) return null;
  if (!data.mine.length && !data.beds.length && !data.candidates.length) return null;
  const refresh = () => setReload((n) => n + 1);
  return (
    <section id="rent" className="mt-6 space-y-4" data-testid="rent-autopay">
      {data.mine.length ? <RenterRent data={data} onChange={refresh} /> : null}
      {data.beds.length || data.candidates.length ? <OwnerRent data={data} onChange={refresh} /> : null}
    </section>
  );
}

function RenterRent({ data, onChange }: { data: On; onChange: () => void }) {
  return (
    <div className={`${card} border-2 border-ink shadow-[0_4px_0_var(--color-brand)]`}>
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand"><Lightning className="h-4 w-4" /> Rent on autopilot</p>
      <h2 className="mt-2 font-display text-3xl">Set it once, never chase rent again 😮‍💨</h2>
      <p className="mt-2 max-w-prose text-muted">
        Approve UPI AutoPay once in your UPI app. Rent goes straight to your PG on the due date, you get a heads-up 24h before. Cancel anytime from your UPI app.
      </p>
      <ul className="mt-4 space-y-3">
        {data.mine.map((p) => (
          <RenterPlan key={p.id} plan={p} ready={data.autopayReady} noPinLimit={data.noPinLimit} onChange={onChange} />
        ))}
      </ul>
    </div>
  );
}

function RenterPlan({ plan, ready, noPinLimit, onChange }: { plan: On["mine"][number]; ready: boolean; noPinLimit: number; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [upi, setUpi] = useState<Upi | null>(null);
  const [utr, setUtr] = useState("");
  const [msg, setMsg] = useState("");
  const on = plan.mandate_status === "ACTIVE";
  const waiting = plan.mandate_status === "INITIALIZED" || plan.mandate_status === "BANK_APPROVAL_PENDING";
  async function autopay() {
    setBusy(true);
    setErr("");
    try {
      const r = await startRentAutopay({ data: { planId: plan.id } });
      const Cashfree = await loadCashfree();
      const res = await Cashfree({ mode: r.mode }).subscriptionsCheckout({ subsSessionId: r.sessionId, redirectTarget: "_self" });
      if (res?.error) setErr(res.error.message ?? "AutoPay didn't open.");
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }
  async function payUpi() {
    setBusy(true);
    setErr("");
    try {
      setUpi(await startRentUpi({ data: { planId: plan.id } }));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }
  async function sendUtr() {
    if (!upi) return;
    setBusy(true);
    setErr("");
    try {
      const r = await submitRentUtr({ data: { planId: plan.id, utr, month: upi.month } });
      setMsg(r.message);
      onChange();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className={inner}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{plan.title}{plan.bed_label ? ` · ${plan.bed_label}` : ""}</p>
          <p className="text-sm text-muted tabular-nums">{inr(plan.amount_inr)} / month · due on the {plan.due_day}{["th", "st", "nd", "rd"][plan.due_day % 10 > 3 || [11, 12, 13].includes(plan.due_day) ? 0 : plan.due_day % 10]} · next {plan.nextDue}</p>
        </div>
        <StatusPill status={plan.entry_status} />
      </div>
      {on ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-trust"><ArrowsClockwise className="h-4 w-4" /> AutoPay is on. You're all set 🙌</p>
      ) : waiting ? (
        <p className="mt-3 text-sm text-muted">Waiting for your bank to approve AutoPay. Usually takes a few minutes.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {ready ? (
            <button type="button" className={btnPrimary} disabled={busy} onClick={autopay} data-testid="rent-autopay-start">
              {busy ? "Opening…" : "Set up AutoPay"}
            </button>
          ) : null}
          <button type="button" className={btnSmall} disabled={busy} onClick={payUpi} data-testid="rent-upi-fallback">
            Pay this month by UPI instead
          </button>
        </div>
      )}
      {!on && plan.amount_inr > noPinLimit ? <p className="mt-2 text-xs text-muted">Rent above {inr(noPinLimit)} needs your UPI PIN each month (NPCI rule).</p> : null}
      {upi ? (
        <div className="mt-3 space-y-2" aria-live="polite">
          <a href={upi.link} className={btnSmallPrimary}>Pay {inr(upi.amount)} to {upi.payee}</a>
          <p className="text-xs text-muted">UPI ID {upi.vpa} · ref <span className="font-mono">{upi.ref}</span></p>
          <div className="flex flex-wrap gap-2">
            <input className={`${input} max-w-xs`} inputMode="numeric" placeholder="12-digit UTR" value={utr} onChange={(e) => setUtr(e.target.value)} aria-label="UTR" />
            <button type="button" className={btnSmall} disabled={busy || utr.replace(/\s/g, "").length !== 12} onClick={sendUtr}>Send UTR</button>
          </div>
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-sm text-trust" role="status">{msg}</p> : null}
      {err ? <p className={`mt-2 ${errorBox}`} role="alert">{err}</p> : null}
    </li>
  );
}

function OwnerRent({ data, onChange }: { data: On; onChange: () => void }) {
  const paid = data.beds.filter((b) => b.entry_status === "PAID").length;
  const failed = data.beds.filter((b) => b.entry_status === "FAILED").length;
  return (
    <div className={card}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Rent this month · {data.month}</p>
      <h2 className="mt-2 font-display text-3xl">
        {paid}/{data.beds.length} beds paid{failed ? ` · ${failed} need a nudge` : " 🔥"}
      </h2>
      {data.beds.length ? (
        <ul className="mt-4 divide-y divide-line">
          {data.beds.map((b) => (
            <OwnerBed key={b.id} bed={b} onChange={onChange} />
          ))}
        </ul>
      ) : null}
      {data.candidates.length ? (
        <div className="mt-4">
          <p className="font-semibold">New move-ins without a rent plan</p>
          <ul className="mt-2 space-y-2">
            {data.candidates.map((c) => (
              <NewPlan key={c.id} c={c} onChange={onChange} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function OwnerBed({ bed, onChange }: { bed: On["beds"][number]; onChange: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="rent-bed">
      <div className="min-w-0">
        <p className="font-semibold">{bed.renter} · {bed.title}{bed.bed_label ? ` · ${bed.bed_label}` : ""}</p>
        <p className="text-sm text-muted tabular-nums">
          {inr(bed.amount_inr)} · due {bed.due_day} · {bed.mandate_status === "ACTIVE" ? "AutoPay on" : "AutoPay off"}
          {bed.utr ? ` · UTR ${bed.utr}` : ""}
        </p>
        {err ? <p className="mt-1 text-sm text-danger" role="alert">{err}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <StatusPill status={bed.entry_status} />
        {bed.utr && bed.entry_status !== "PAID" ? (
          <button
            type="button"
            className={btnSmall}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await confirmRentUtr({ data: { planId: bed.id } });
                onChange();
              } catch (e) {
                setErr(errText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Got it
          </button>
        ) : null}
      </div>
    </li>
  );
}

function NewPlan({ c, onChange }: { c: On["candidates"][number]; onChange: () => void }) {
  const [dueDay, setDueDay] = useState("5");
  const [bed, setBed] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <li className={inner}>
      <p className="font-semibold">{c.renter} · {c.title} · {inr(c.rent)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input className={`${input} max-w-[10rem]`} placeholder="Bed (e.g. B2)" value={bed} onChange={(e) => setBed(e.target.value)} aria-label="Bed label" />
        <label className="inline-flex items-center gap-2 text-sm">
          Due day
          <input className={`${input} w-20`} type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        </label>
        <button
          type="button"
          className={btnSmallPrimary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await createRentPlan({ data: { moveInId: c.id, dueDay: Number(dueDay), bedLabel: bed } });
              onChange();
            } catch (e) {
              setErr(errText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Start monthly rent
        </button>
      </div>
      {err ? <p className={`mt-2 ${errorBox}`} role="alert">{err}</p> : null}
    </li>
  );
}

/** Listing badge: "96% rent on time" from bank-confirmed AutoPay months. Nothing when there's no data. */
export function RentOnTimeBadge({ listingId }: { listingId: string }) {
  const [b, setB] = useState<Awaited<ReturnType<typeof getListingRentBadge>>>(null);
  useEffect(() => {
    getListingRentBadge({ data: listingId }).then(setB).catch(() => setB(null));
  }, [listingId]);
  if (!b) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-trust/10 px-2 py-1 text-xs font-semibold text-trust" data-testid="rent-on-time-badge" title={`Bank-confirmed AutoPay rent, last ${b.months} month${b.months === 1 ? "" : "s"}`}>
      <CheckCircle className="h-3.5 w-3.5" /> {b.percent}% rent paid on time
    </span>
  );
}
