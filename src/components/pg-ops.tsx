import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowClockwise, Megaphone, PushPin, Trash } from "@phosphor-icons/react";
import { btnSmall, btnSmallPrimary, card, errorBox, inner, input } from "@/components/ui-tokens";
import { errText } from "@/lib/ui-text";
import { BED_STATUS, MEAL_CUTOFF_HOUR_IST, type BedStatus } from "@/lib/roomsetu/pg-ops";
import { deleteBed, getHeadcount, getPgOps, noticeAction, postNotice, relistBed, saveBed, setMealSkip } from "@/lib/roomsetu/pg-ops-api";

type Data = Awaited<ReturnType<typeof getPgOps>>;
type On = Extract<Data, { enabled: true }>;
type L = On["board"]["listings"][number];
type Bed = L["beds"][number];
const TONE: Record<string, string> = { OCCUPIED: "border-line", VACANT: "border-brand", ON_NOTICE: "border-marigold", BLOCKED: "border-line opacity-60" };
const dayLabel = (iso: string, today: string) => (iso === today ? "Today" : new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" }));

function useAct(after?: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const run = async (fn: () => Promise<unknown>, ok = "") => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      after?.();
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, msg, run };
}

/** Dashboard: owner bed board + meal headcount + notices; resident meal skips + notices. Hidden while the flag is off. */
export function PgOpsSection() {
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(() => getPgOps().then(setData).catch(() => setData(null)), []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!data?.enabled) return null;
  const isOwner = data.board.listings.length > 0;
  const isResident = data.notices.residencies.length > 0;
  if (!isOwner && !isResident) return null;
  return (
    <>
      {isResident ? <ResidentPanel data={data} reload={load} /> : null}
      {isOwner ? <BedBoard data={data} reload={load} /> : null}
      {isOwner ? <Kitchen data={data} /> : null}
      {isOwner ? <OwnerNotices data={data} reload={load} /> : null}
    </>
  );
}

function BedBoard({ data, reload }: { data: On; reload: () => void }) {
  const s = data.board.summary;
  return (
    <section id="beds" className="mt-6 space-y-3">
      <h2 className="font-display text-3xl">Bed board 🛏️</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Occupied", s.occupied], ["Vacant", s.vacant], ["On notice", s.onNotice], ["Blocked", s.blocked]].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-card p-4">
            <p className="text-sm text-muted">{k}</p>
            <p className="font-display text-3xl tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      {data.board.listings.map((l) => (
        <ListingBeds key={l.id} l={l} reload={reload} />
      ))}
    </section>
  );
}

function ListingBeds({ l, reload }: { l: L; reload: () => void }) {
  const [editing, setEditing] = useState<Bed | "new" | null>(null);
  const { busy, err, msg, run } = useAct(reload);
  return (
    <article className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{l.title}</p>
        <span className="text-xs text-muted">listing {l.status.toLowerCase()} · free from {l.available_from}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {l.beds.map((b) => (
          <div key={b.id} className={`rounded-lg border-2 bg-paper p-3 ${TONE[b.status] ?? "border-line"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold">{b.label}</p>
              <span className="text-xs font-semibold">{BED_STATUS[b.status as BedStatus]}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {b.tenantName || (b.status === "VACANT" ? "Up for grabs" : "-")}
              {b.moveInDate ? ` · in ${b.moveInDate}` : ""}
              {b.noticeEnd ? ` · leaves ${b.noticeEnd}` : ""}
            </p>
            {b.note ? <p className="text-xs text-muted">{b.note}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {b.status === "VACANT" || b.status === "ON_NOTICE" ? (
                <button className={btnSmallPrimary} disabled={busy} onClick={() => run(() => relistBed({ data: { id: b.id } }), "Relisted ✨ It's back in search.")}>
                  <ArrowClockwise /> Relist
                </button>
              ) : null}
              <button className={btnSmall} onClick={() => setEditing(b)}>Edit</button>
            </div>
          </div>
        ))}
        <button className={`${btnSmall} h-auto min-h-16`} onClick={() => setEditing("new")}>+ Add a bed</button>
      </div>
      {msg ? (
        <p className="mt-2 text-sm">
          {msg}{" "}
          <Link to="/edit-listing/$id" params={{ id: l.id }} className="font-semibold text-brand underline">
            Check availability on the listing →
          </Link>
        </p>
      ) : null}
      {err ? <p className={`mt-2 ${errorBox}`}>{err}</p> : null}
      {editing ? <BedForm l={l} bed={editing === "new" ? null : editing} done={() => { setEditing(null); reload(); }} /> : null}
    </article>
  );
}

function BedForm({ l, bed, done }: { l: L; bed: Bed | null; done: () => void }) {
  const [f, setF] = useState({ label: bed?.label ?? "", status: bed?.status ?? "VACANT", tenantName: bed?.tenantName ?? "", tenantUserId: "", moveInDate: bed?.moveInDate ?? "", noticeEnd: bed?.noticeEnd ?? "", note: bed?.note ?? "" });
  const { busy, err, run } = useAct(done);
  const occupied = f.status === "OCCUPIED" || f.status === "ON_NOTICE";
  return (
    <form className={`mt-3 ${inner} space-y-2`} onSubmit={(e) => { e.preventDefault(); void run(() => saveBed({ data: { listingId: l.id, bedId: bed?.id, ...f } })); }}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={input} placeholder="Bed name (Room 2 · B)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <select className={input} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
          {Object.entries(BED_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {occupied ? (
          <>
            {l.unplaced.length ? (
              <select className={input} value={f.tenantUserId} onChange={(e) => { const u = l.unplaced.find((x) => x.userId === e.target.value); setF({ ...f, tenantUserId: e.target.value, tenantName: u?.name ?? f.tenantName, moveInDate: u?.since ?? f.moveInDate }); }} aria-label="Roomeo resident">
                <option value="">Pick a Roomeo resident (optional)</option>
                {l.unplaced.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}
              </select>
            ) : null}
            <input className={input} placeholder="Resident name" value={f.tenantName} onChange={(e) => setF({ ...f, tenantName: e.target.value })} />
            <label className="text-sm text-muted">Moved in<input className={input} type="date" value={f.moveInDate} onChange={(e) => setF({ ...f, moveInDate: e.target.value })} /></label>
            {f.status === "ON_NOTICE" ? <label className="text-sm text-muted">Notice ends<input className={input} type="date" value={f.noticeEnd} onChange={(e) => setF({ ...f, noticeEnd: e.target.value })} /></label> : null}
          </>
        ) : null}
        <input className={input} placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      {err ? <p className={errorBox}>{err}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button className={btnSmallPrimary} disabled={busy}>Save bed</button>
        {bed ? <button type="button" className={btnSmall} disabled={busy} onClick={() => run(() => deleteBed({ data: { id: bed.id } }))}><Trash /> Remove</button> : null}
        <button type="button" className={btnSmall} onClick={done}>Cancel</button>
      </div>
    </form>
  );
}

function Kitchen({ data }: { data: On }) {
  const [date, setDate] = useState(data.today);
  const [rows, setRows] = useState(data.headcounts);
  const { err, run } = useAct();
  return (
    <section id="kitchen" className="mt-6 space-y-3">
      <h2 className="font-display text-3xl">Kitchen headcount 🍛</h2>
      <div className="flex flex-wrap items-center gap-2">
        {data.days.map((d) => (
          <button key={d} className={`rounded-full border px-3 py-1 text-sm ${d === date ? "border-brand bg-brand text-card" : "border-line"}`}
            onClick={() => { setDate(d); void run(async () => setRows(await Promise.all(data.headcounts.map(async (h) => ({ ...h, ...(await getHeadcount({ data: { listingId: h.listingId, date: d } })) }))))); }}>
            {dayLabel(d, data.today)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">Skips lock at {MEAL_CUTOFF_HOUR_IST} AM, so after that this is the final count for the caterer.</p>
      {rows.map((h) => (
        <article key={h.listingId} className={card}>
          <p className="font-semibold">{h.title}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className={inner}><p className="text-xs text-muted">Residents</p><p className="font-display text-2xl tabular-nums">{h.residents}</p></div>
            <div className={inner}><p className="text-xs text-muted">Lunch</p><p className="font-display text-2xl tabular-nums">{h.LUNCH}</p></div>
            <div className={inner}><p className="text-xs text-muted">Dinner</p><p className="font-display text-2xl tabular-nums">{h.DINNER}</p></div>
          </div>
          {h.skipping.length ? <p className="mt-2 text-xs text-muted">Skipping: {h.skipping.map((s) => `${s.name} (${s.meal.toLowerCase()})`).join(", ")}</p> : null}
        </article>
      ))}
      {err ? <p className={errorBox}>{err}</p> : null}
    </section>
  );
}

function OwnerNotices({ data, reload }: { data: On; reload: () => void }) {
  const [f, setF] = useState({ listingId: data.board.listings[0]?.id ?? "", title: "", body: "", pinned: false });
  const { busy, err, run } = useAct(() => { setF((x) => ({ ...x, title: "", body: "", pinned: false })); reload(); });
  return (
    <section id="notices" className="mt-6 space-y-3">
      <h2 className="font-display text-3xl">House notices 📢</h2>
      <form className={card} onSubmit={(e) => { e.preventDefault(); void run(() => postNotice({ data: f })); }}>
        {data.board.listings.length > 1 ? (
          <select className={`mb-2 ${input}`} value={f.listingId} onChange={(e) => setF({ ...f, listingId: e.target.value })} aria-label="PG">
            {data.board.listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        ) : null}
        <input className={input} placeholder="e.g. Water off Sunday 10 AM–12 PM" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <textarea className="mt-2 w-full rounded-lg border border-line bg-card p-3" rows={2} placeholder="Details (optional)" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Pin it</label>
          <button className={btnSmallPrimary} disabled={busy}><Megaphone /> Post to residents</button>
        </div>
        <p className="mt-1 text-xs text-muted">Residents see it on their dashboard (in-app only, no WhatsApp).</p>
        {err ? <p className={`mt-2 ${errorBox}`}>{err}</p> : null}
      </form>
      {data.notices.posted.map((n) => (
        <article key={n.id} className={card}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">{n.pinned ? <PushPin className="inline" /> : null} {n.title}</p>
            <span className="text-xs text-muted">👀 {n.reads} read</span>
          </div>
          {n.body ? <p className="mt-1 text-sm">{n.body}</p> : null}
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>{n.pg} · {n.createdAt}</span>
            <button className="font-semibold text-danger" onClick={() => run(() => noticeAction({ data: { id: n.id, action: "delete" } }))}>Delete</button>
          </div>
        </article>
      ))}
    </section>
  );
}

function ResidentPanel({ data, reload }: { data: On; reload: () => void }) {
  const { busy, err, run } = useAct(reload);
  const home = data.notices.residencies[0];
  const skipped = new Set(data.skips);
  const open = (d: string) => Date.now() < new Date(`${d}T${String(MEAL_CUTOFF_HOUR_IST).padStart(2, "0")}:00:00+05:30`).getTime();
  return (
    <section id="my-pg" className="mt-6 space-y-3">
      <h2 className="font-display text-3xl">Your PG 🏡</h2>
      {data.notices.resident.length ? (
        <div className="space-y-2">
          {data.notices.resident.map((n) => (
            <article key={n.id} className={`${card} ${n.read ? "opacity-70" : "border-brand"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{n.pinned ? <PushPin className="inline" /> : null} {n.title}</p>
                {n.read ? <span className="text-xs text-muted">read ✓</span> : <button className={btnSmall} disabled={busy} onClick={() => run(() => noticeAction({ data: { id: n.id, action: "read" } }))}>Got it 👍</button>}
              </div>
              {n.body ? <p className="mt-1 text-sm">{n.body}</p> : null}
              <p className="mt-1 text-xs text-muted">{n.pg} · {n.createdAt}</p>
            </article>
          ))}
        </div>
      ) : null}
      {home ? (
        <article className={card}>
          <p className="font-semibold">Skipping a meal? 🍛</p>
          <p className="text-xs text-muted">Tap to skip. Changes lock at {MEAL_CUTOFF_HOUR_IST} AM on the day, so the kitchen cooks the right amount (less food wasted 🌱).</p>
          <div className="mt-3 space-y-2">
            {data.days.map((d) => (
              <div key={d} className="flex items-center justify-between gap-2">
                <span className="w-20 text-sm font-semibold">{dayLabel(d, data.today)}</span>
                <div className="flex gap-2">
                  {(["LUNCH", "DINNER"] as const).map((m) => {
                    const on = skipped.has(`${d}|${m}`);
                    return (
                      <button key={m} disabled={busy || !open(d)} onClick={() => run(() => setMealSkip({ data: { listingId: home.listing_id, date: d, meal: m, skip: !on } }))}
                        className={`h-10 rounded-full border px-4 text-sm font-semibold disabled:opacity-40 ${on ? "border-danger text-danger line-through" : "border-line"}`}>
                        {m === "LUNCH" ? "Lunch" : "Dinner"}{on ? " · skip" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : null}
      {err ? <p className={errorBox}>{err}</p> : null}
    </section>
  );
}
