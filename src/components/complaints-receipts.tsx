import { useCallback, useEffect, useState } from "react";
import { FilePdf, Star, Wrench, Receipt } from "@phosphor-icons/react";
import { compressPhoto } from "@/components/photo-upload";
import { downloadBase64 } from "@/components/download";
import { btnSmall, btnSmallPrimary, card, errorBox, inner, input } from "@/components/ui-tokens";
import { errText } from "@/lib/ui-text";
import { CATEGORIES, STATUS_LABEL, fixTimeLabel, monthPeriod } from "@/lib/roomsetu/complaints";
import { getComplaintPhoto, getComplaintsAndReceipts, getReceiptPdf, markRentPaid, raiseComplaint, saveReceiptProfile, updateComplaint } from "@/lib/roomsetu/complaints-api";

type Data = Awaited<ReturnType<typeof getComplaintsAndReceipts>>;
type On = Extract<Data, { enabled: true }>;
type C = On["mine"][number];
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function useAct(after?: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      after?.();
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, run };
}

/** Dashboard: complaints (tenant raises, owner fixes) + rent receipts. Hidden while the flag is off. */
export function ComplaintsReceiptsSection() {
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(() => getComplaintsAndReceipts().then(setData).catch(() => setData(null)), []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!data?.enabled) return null;
  const showComplaints = data.tenancies.length > 0 || data.owned.length > 0 || data.mine.length > 0;
  const showReceipts = data.receipts.length > 0 || data.residents.length > 0;
  if (!showComplaints && !showReceipts) return null;
  return (
    <>
      {showComplaints ? (
        <section id="complaints" className="mt-6 space-y-3">
          <h2 className="font-display text-3xl">Something broken? 🔧</h2>
          {data.ownerStats ? (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Open now" value={String(data.ownerStats.open)} />
              <Stat label="Avg fix time" value={fixTimeLabel(data.ownerStats.avgFixHours)} />
              <Stat label="Fix rating" value={data.ownerStats.avgRating ? `${data.ownerStats.avgRating}★` : "-"} />
            </div>
          ) : null}
          {data.tenancies.length ? <RaiseForm tenancies={data.tenancies} reload={load} /> : null}
          {[...data.mine.map((c) => ({ c, owner: false })), ...data.owned.map((c) => ({ c, owner: true }))].map(({ c, owner }) => (
            <ComplaintCard key={`${owner}-${c.id}`} c={c} owner={owner} reload={load} />
          ))}
        </section>
      ) : null}
      {showReceipts ? <Receipts data={data} reload={load} /> : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display text-2xl tabular-nums">{value}</p>
    </div>
  );
}

function RaiseForm({ tenancies, reload }: { tenancies: On["tenancies"]; reload: () => void }) {
  const [f, setF] = useState({ listingId: tenancies[0]?.listing_id ?? "", category: "AC", description: "", photo: "" });
  const { busy, err, run } = useAct(() => {
    setF((x) => ({ ...x, description: "", photo: "" }));
    reload();
  });
  return (
    <form className={card} onSubmit={(e) => { e.preventDefault(); void run(() => raiseComplaint({ data: f })); }}>
      <p className="font-semibold">Raise a complaint</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(CATEGORIES).map(([k, v]) => (
          <button type="button" key={k} onClick={() => setF({ ...f, category: k })} className={`rounded-full border px-3 py-1 text-sm ${f.category === k ? "border-brand bg-brand text-card" : "border-line"}`}>
            {v}
          </button>
        ))}
      </div>
      {tenancies.length > 1 ? (
        <select className={`mt-2 ${input}`} value={f.listingId} onChange={(e) => setF({ ...f, listingId: e.target.value })}>
          {tenancies.map((t) => <option key={t.listing_id} value={t.listing_id}>{t.title}</option>)}
        </select>
      ) : null}
      <textarea className={`mt-2 w-full rounded-lg border border-line bg-card p-3`} rows={3} placeholder="What's up? e.g. AC in room 2 not cooling since last night" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div className="mt-2 flex flex-wrap gap-2">
        <label className={btnSmall}>
          {f.photo ? "Photo ✓" : "📸 Add photo"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setF({ ...f, photo: await compressPhoto(file).catch(() => "") }); }} />
        </label>
        <button className={btnSmallPrimary} disabled={busy}>{busy ? "Sending…" : "Send to owner"}</button>
      </div>
      {err ? <p className={`mt-2 ${errorBox}`}>{err}</p> : null}
    </form>
  );
}

function ComplaintCard({ c, owner, reload }: { c: C; owner: boolean; reload: () => void }) {
  const { busy, err, run } = useAct(reload);
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(0);
  const [img, setImg] = useState<string | null>(null);
  const act = (to: string, extra: Record<string, unknown> = {}) => run(() => updateComplaint({ data: { id: c.id, to, note, ...extra } }));
  return (
    <article className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold"><Wrench className="inline" /> {CATEGORIES[c.category]} · <span className="text-muted">{owner ? `${c.tenantName} · ` : ""}{c.title}</span></p>
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold">{STATUS_LABEL[c.status]}</span>
      </div>
      <p className="mt-1 text-sm">{c.description}</p>
      <p className="mt-1 text-xs text-muted">Raised {c.createdAt.slice(0, 16)}{c.fixedAt ? ` · fixed ${c.fixedAt.slice(0, 16)}` : ""}</p>
      {c.ownerNote ? <p className={`mt-2 ${inner} text-sm`}>Owner: {c.ownerNote}</p> : null}
      {c.hasPhoto ? <button className="mt-2 text-xs font-semibold text-brand underline" onClick={() => run(async () => setImg(img ? null : (await getComplaintPhoto({ data: { id: c.id } })).dataUrl))}>{img ? "hide photo" : "see photo"}</button> : null}
      {img ? <img src={img} alt="Complaint" className="mt-2 max-h-56 rounded-lg border border-line" /> : null}
      {c.rating ? <p className="mt-2 text-sm">{"★".repeat(c.rating)}{"☆".repeat(5 - c.rating)} {c.ratingNote}</p> : null}
      {owner && (c.status === "OPEN" || c.status === "IN_PROGRESS") ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <input className={`${input} min-w-40 flex-1`} placeholder="Update for the resident (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {c.status === "OPEN" ? <button className={btnSmall} disabled={busy} onClick={() => act("IN_PROGRESS")}>On it 🛠️</button> : null}
          <button className={btnSmallPrimary} disabled={busy} onClick={() => act("FIXED")}>Mark fixed ✅</button>
        </div>
      ) : null}
      {!owner && c.status === "FIXED" ? (
        <div className="mt-3 space-y-2">
          <div className="flex gap-1" role="radiogroup" aria-label="Rate the fix">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setRating(n)} className="text-2xl">
                <Star weight={n <= rating ? "fill" : "regular"} />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <input className={`${input} min-w-40 flex-1`} placeholder="Anything to add?" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className={btnSmallPrimary} disabled={busy || !rating} onClick={() => act("CONFIRM", { rating })}>Yep, fixed 🙌</button>
            <button className={btnSmall} disabled={busy} onClick={() => act("OPEN")}>Not fixed</button>
          </div>
        </div>
      ) : null}
      {err ? <p className={`mt-2 ${errorBox}`}>{err}</p> : null}
    </article>
  );
}

function Receipts({ data, reload }: { data: On; reload: () => void }) {
  const { busy, err, run } = useAct();
  const save = useAct(reload);
  const thisMonth = today().slice(0, 7);
  const [m, setM] = useState({ moveInId: data.residents[0]?.id ?? "", month: thisMonth, amountInr: String(data.residents[0]?.rent ?? ""), paidOn: today(), method: "UPI", ref: "" });
  const [p, setP] = useState({ landlordName: data.profile?.landlordName ?? "", pan: data.profile?.pan ?? "", address: data.profile?.address ?? "" });
  return (
    <section id="receipts" className="mt-6 space-y-3">
      <h2 className="font-display text-3xl">Rent receipts 🧾</h2>
      <p className="text-sm text-muted">Monthly PDFs your office accepts for HRA.</p>
      {data.receipts.length ? (
        <ul className={`${card} divide-y divide-line`}>
          {data.receipts.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <Receipt className="inline" /> {monthPeriod(r.month).label} · {inr(r.amountInr)} <span className="text-xs text-muted">{r.source === "autopay" ? "AutoPay" : "marked paid"} {r.paidOn}</span>
              </span>
              <button className={btnSmall} disabled={busy} onClick={() => run(async () => { const x = await getReceiptPdf({ data: { key: r.key } }); downloadBase64(x.base64, x.filename); })}>
                <FilePdf /> PDF
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${inner} text-sm`}>No paid months yet. Receipts show up here once rent is in.</p>
      )}
      {err ? <p className={errorBox}>{err}</p> : null}
      {data.residents.length ? (
        <>
          <form className={card} onSubmit={(e) => { e.preventDefault(); void save.run(() => markRentPaid({ data: m })); }}>
            <p className="font-semibold">Got rent outside AutoPay? Mark it paid</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <select className={input} value={m.moveInId} onChange={(e) => setM({ ...m, moveInId: e.target.value })} aria-label="Resident">
                {data.residents.map((r) => <option key={r.id} value={r.id}>{r.tenant} · {r.title}</option>)}
              </select>
              <input className={input} type="month" value={m.month} onChange={(e) => setM({ ...m, month: e.target.value })} aria-label="Rent month" />
              <input className={input} inputMode="numeric" value={m.amountInr} onChange={(e) => setM({ ...m, amountInr: e.target.value })} aria-label="Amount" />
              <input className={input} type="date" value={m.paidOn} onChange={(e) => setM({ ...m, paidOn: e.target.value })} aria-label="Paid on" />
              <select className={input} value={m.method} onChange={(e) => setM({ ...m, method: e.target.value })} aria-label="Mode">
                <option value="UPI">UPI</option>
                <option value="BANK">Bank transfer</option>
                <option value="CASH">Cash</option>
              </select>
              <input className={input} placeholder="UTR / ref (optional)" value={m.ref} onChange={(e) => setM({ ...m, ref: e.target.value })} />
            </div>
            <button className={`mt-2 ${btnSmallPrimary}`} disabled={save.busy}>Mark paid + make receipt</button>
          </form>
          <form className={card} onSubmit={(e) => { e.preventDefault(); void save.run(() => saveReceiptProfile({ data: p })); }}>
            <p className="font-semibold">Landlord details on receipts</p>
            <p className="text-xs text-muted">PAN is optional, but offices ask for it when yearly rent crosses ₹1,00,000.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input className={input} placeholder="Landlord / company name" value={p.landlordName} onChange={(e) => setP({ ...p, landlordName: e.target.value })} />
              <input className={input} placeholder="PAN (optional)" value={p.pan} onChange={(e) => setP({ ...p, pan: e.target.value })} />
              <input className={input} placeholder="Landlord address" value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} />
            </div>
            <button className={`mt-2 ${btnSmall}`} disabled={save.busy}>Save</button>
          </form>
          {save.err ? <p className={errorBox}>{save.err}</p> : null}
        </>
      ) : null}
    </section>
  );
}
