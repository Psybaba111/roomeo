import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { WhatsappLogo, Copy, FilePdf, IdentificationCard, Warning } from "@phosphor-icons/react";
import { compressPhoto } from "@/components/photo-upload";
import { downloadBase64 } from "@/components/download";
import { btnSmall, btnSmallPrimary, card, errorBox, inner, input } from "@/components/ui-tokens";
import { errText } from "@/lib/ui-text";
import { whatsappShareUrl } from "@/lib/share";
import { depositStatusLabel } from "@/lib/roomsetu/movein";
import { readableDate } from "@/lib/roomsetu/dates";
import {
  addDepositDeduction,
  createMoveInInvite,
  depositAction,
  getAgreementPdf,
  getDeductionPhoto,
  getMoveInIdPhoto,
  getMoveIns,
  getPoliceFormPdf,
  recordMoveInDeposit,
} from "@/lib/roomsetu/movein-api";

type Data = Awaited<ReturnType<typeof getMoveIns>>;
type On = Extract<Data, { enabled: true }>;
type Item = On["items"][number];
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const STATUS: Record<string, string> = { SENT: "Link sent 📨", SUBMITTED: "Details in, not signed ✍️", SIGNED: "Signed ✅" };

/** Dashboard: owner sends move-in links + tracks deposits; resident sees theirs. Hidden while the flag is off. */
export function MoveInSection() {
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(() => getMoveIns().then(setData).catch(() => setData(null)), []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!data?.enabled) return null;
  const owned = data.items.filter((i) => i.role === "owner");
  const mine = data.items.filter((i) => i.role === "tenant");
  return (
    <section id="move-in" className="mt-6 space-y-3">
      <h2 className="font-display text-3xl">Move-ins &amp; deposits</h2>
      {mine.map((m) => (
        <TenantCard key={m.id} m={m} reload={load} />
      ))}
      {data.listings.length ? <NewInvite listings={data.listings} reload={load} /> : null}
      {owned.map((m) => (
        <OwnerCard key={m.id} m={m} base={data.base} reload={load} />
      ))}
    </section>
  );
}

function NewInvite({ listings, reload }: { listings: On["listings"]; reload: () => void }) {
  const [f, setF] = useState({ listingId: listings[0]?.id ?? "", bedLabel: "", startDate: today(), rentInr: "", depositInr: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className={card}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          const r = await createMoveInInvite({ data: f });
          setLink(r.link);
          reload();
        } catch (x) {
          setErr(errText(x));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="font-semibold">New resident? Send a move-in link 🔑</p>
      <p className="mt-1 text-sm text-muted">They fill details, upload ID and e-sign the stay agreement. You get the police form ready to print.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select className={input} value={f.listingId} onChange={set("listingId")} aria-label="Listing">
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
        <input className={input} placeholder="Bed (e.g. Room 2 · Bed B)" value={f.bedLabel} onChange={set("bedLabel")} />
        <label className="text-sm text-muted">
          Move-in date
          <input className={input} type="date" value={f.startDate} onChange={set("startDate")} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input className={input} inputMode="numeric" placeholder="Rent (listing)" value={f.rentInr} onChange={set("rentInr")} />
          <input className={input} inputMode="numeric" placeholder="Deposit (listing)" value={f.depositInr} onChange={set("depositInr")} />
        </div>
      </div>
      {err ? <p className={`mt-2 ${errorBox}`}>{err}</p> : null}
      <button className={`mt-3 ${btnSmallPrimary}`} disabled={busy || !f.listingId}>
        {busy ? "Making link…" : "Make move-in link"}
      </button>
      {link ? <ShareLink link={link} /> : null}
    </form>
  );
}

function ShareLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`mt-3 ${inner} flex flex-wrap items-center gap-2`}>
      <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
      <a className={btnSmall} href={whatsappShareUrl("Your Roomeo move-in link. Fill details, upload ID, sign the stay agreement 🏠", link)} target="_blank" rel="noreferrer">
        <WhatsappLogo /> Share
      </a>
      <button type="button" className={btnSmall} onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}>
        <Copy /> {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function useAct() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, run };
}

function Docs({ m, owner }: { m: Item; owner: boolean }) {
  const { busy, err, run } = useAct();
  const [idUrl, setIdUrl] = useState<string | null>(null);
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button className={btnSmall} disabled={busy} onClick={() => run(async () => { const r = await getAgreementPdf({ data: { id: m.id } }); downloadBase64(r.base64, r.filename); })}>
          <FilePdf /> Agreement
        </button>
        {owner && m.tenantName ? (
          <>
            <button className={btnSmall} disabled={busy} onClick={() => run(async () => { const r = await getPoliceFormPdf({ data: { id: m.id } }); downloadBase64(r.base64, r.filename); })}>
              <FilePdf /> Police form
            </button>
            <button className={btnSmall} disabled={busy} onClick={() => run(async () => setIdUrl(idUrl ? null : (await getMoveInIdPhoto({ data: { id: m.id } })).dataUrl))}>
              <IdentificationCard /> {idUrl ? "Hide ID" : "View ID"}
            </button>
          </>
        ) : null}
      </div>
      {idUrl ? <img src={idUrl} alt="Resident ID (private)" className="mt-2 max-h-64 rounded-lg border border-line" /> : null}
      {err ? <p className={`mt-2 ${errorBox}`}>{err}</p> : null}
    </div>
  );
}

function OwnerCard({ m, base, reload }: { m: Item; base: string; reload: () => void }) {
  return (
    <article className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {m.tenantName ?? "Waiting for resident"} · <span className="text-muted">{m.title}{m.bedLabel ? ` · ${m.bedLabel}` : ""}</span>
        </p>
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold">{STATUS[m.status] ?? m.status}</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        From {readableDate(m.startDate)} · {inr(m.rentInr)}/mo · deposit {inr(m.depositInr)}
        {m.idMasked ? ` · ID ${m.idMasked}` : ""}
      </p>
      {m.outsideMangaluru ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-marigold-soft px-3 py-1 text-xs font-semibold text-ink">
          <Warning /> From outside Mangaluru: home town police clearance needed
        </p>
      ) : null}
      {m.status === "SENT" ? <ShareLink link={`${base}${m.token}`} /> : null}
      <Docs m={m} owner />
      <DepositPanel m={m} owner reload={reload} />
    </article>
  );
}

function TenantCard({ m, reload }: { m: Item; reload: () => void }) {
  return (
    <article className={card}>
      <p className="font-semibold">Your stay at {m.title} 🏡</p>
      <p className="mt-1 text-sm text-muted">{STATUS[m.status] ?? m.status} · from {readableDate(m.startDate)}</p>
      {m.status !== "SIGNED" ? (
        <Link to="/move-in/$token" params={{ token: m.token }} className={`mt-3 ${btnSmallPrimary}`}>
          Finish move-in →
        </Link>
      ) : (
        <Docs m={m} owner={false} />
      )}
      <DepositPanel m={m} owner={false} reload={reload} />
    </article>
  );
}

function DepositPanel({ m, owner, reload }: { m: Item; owner: boolean; reload: () => void }) {
  const { busy, err, run } = useAct();
  const [amt, setAmt] = useState(String(m.depositInr));
  const [ded, setDed] = useState({ amountInr: "", reason: "", photo: "" });
  const [date, setDate] = useState(today());
  const [refRef, setRef] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const d = m.deposit;
  const go = (fn: () => Promise<unknown>) => run(async () => { await fn(); reload(); });
  if (!d) {
    if (!owner) return <p className="mt-3 text-sm text-muted">Deposit not recorded yet. Ask your owner to log it here so it's on record 🧾</p>;
    return (
      <div className={`mt-3 ${inner}`}>
        <p className="text-sm font-semibold">Got the deposit? Log it 🧾</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input className={`${input} max-w-36`} inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Deposit amount" />
          <input className={`${input} max-w-44`} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Received on" />
          <button className={btnSmallPrimary} disabled={busy} onClick={() => go(() => recordMoveInDeposit({ data: { id: m.id, amountInr: amt, receivedOn: date } }))}>
            Save
          </button>
        </div>
        {err ? <p className={`mt-2 ${errorBox}`}>{err}</p> : null}
      </div>
    );
  }
  return (
    <div className={`mt-3 ${inner}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          Deposit {inr(d.amountInr)} · received {readableDate(d.receivedOn)}
        </p>
        <span className="text-xs font-semibold">{depositStatusLabel({ status: d.status, refund_due_on: d.refundDueOn }, today())}</span>
      </div>
      {d.deductions.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {d.deductions.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2">
              <span>−{inr(x.amountInr)} · {x.reason}</span>
              {x.hasPhoto ? (
                <button className="text-xs font-semibold text-brand underline" onClick={() => run(async () => setPhoto((await getDeductionPhoto({ data: { id: x.id } })).dataUrl))}>
                  photo
                </button>
              ) : null}
              <span className="text-xs text-muted">{x.tenantAckAt ? "acknowledged ✓" : "not acknowledged"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {photo ? <img src={photo} alt="Deduction evidence" className="mt-2 max-h-56 rounded-lg border border-line" onClick={() => setPhoto(null)} /> : null}
      <p className="mt-2 text-sm">
        {d.status === "REFUNDED" ? (
          <>
            Refunded <b>{inr(d.refundedInr ?? 0)}</b> on {readableDate(d.refundedOn)}
            {d.refundRef ? ` (ref ${d.refundRef})` : ""}
          </>
        ) : (
          <>
            Balance to refund: <b>{inr(d.balanceInr)}</b>
            {d.refundDueOn ? ` by ${readableDate(d.refundDueOn)}` : ""}
          </>
        )}
      </p>
      {!owner && (!d.tenantAckAt || d.deductions.some((x) => !x.tenantAckAt)) ? (
        <button className={`mt-2 ${btnSmallPrimary}`} disabled={busy} onClick={() => go(() => depositAction({ data: { depositId: d.id, action: "ack" } }))}>
          Looks right, acknowledge 👍
        </button>
      ) : null}
      {owner && d.status !== "REFUNDED" ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input className={`${input} max-w-28`} inputMode="numeric" placeholder="₹" value={ded.amountInr} onChange={(e) => setDed({ ...ded, amountInr: e.target.value })} aria-label="Deduction amount" />
            <input className={`${input} min-w-40 flex-1`} placeholder="Reason (e.g. broken chair)" value={ded.reason} onChange={(e) => setDed({ ...ded, reason: e.target.value })} />
            <label className={btnSmall}>
              {ded.photo ? "Photo ✓" : "Add photo"}
              <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setDed({ ...ded, photo: await compressPhoto(f) }); }} />
            </label>
            <button className={btnSmall} disabled={busy} onClick={() => go(async () => { await addDepositDeduction({ data: { depositId: d.id, ...ded } }); setDed({ amountInr: "", reason: "", photo: "" }); })}>
              Add deduction
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input className={`${input} max-w-44`} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
            {d.status === "HELD" ? (
              <button className={btnSmall} disabled={busy} onClick={() => go(() => depositAction({ data: { depositId: d.id, action: "checkout", date } }))}>
                Set checkout (refund due +7 days)
              </button>
            ) : (
              <>
                <input className={`${input} max-w-40`} placeholder="UPI / UTR ref" value={refRef} onChange={(e) => setRef(e.target.value)} />
                <button className={btnSmallPrimary} disabled={busy} onClick={() => go(() => depositAction({ data: { depositId: d.id, action: "refund", date, amountInr: d.balanceInr, ref: refRef } }))}>
                  Mark {inr(d.balanceInr)} refunded
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {err ? <p className={`mt-2 ${errorBox}`}>{err}</p> : null}
    </div>
  );
}
