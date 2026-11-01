import { useEffect, useState } from "react";
import { btnSmall, btnSmallPrimary, card, inner, input } from "@/components/ui-tokens";
import { errText } from "@/lib/ui-text";
import { confirmTrialIdChecked, getListingTrial, getOwnerListingTrial, saveListingTrial, startTrialBooking } from "@/lib/roomsetu/trial-api";
import { TRIAL_MAX_NIGHTS } from "@/lib/roomsetu/trial-nights";

const feeLine = (f: { total: number; base: number; gst: number }) => `₹${f.total} incl. GST (₹${f.base.toFixed(2)} + ₹${f.gst.toFixed(2)} GST)`;

/** Owner toggle on the edit page: "Offer trial nights" + nightly price. Only the owner sees it. */
export function TrialNightsOwner({ listingId }: { listingId: string }) {
  const [s, setS] = useState<Awaited<ReturnType<typeof getOwnerListingTrial>>>(null);
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    void getOwnerListingTrial({ data: { listingId } }).then((r) => {
      setS(r);
      if (r?.nightlyInr) setPrice(String(r.nightlyInr));
    }).catch(() => setS(null));
  }, [listingId]);
  if (!s) return null;
  async function save(enabled: boolean) {
    setMsg("");
    try {
      await saveListingTrial({ data: { listingId, enabled, nightlyInr: price } });
      setS((x) => (x ? { ...x, enabled } : x));
      setMsg(enabled ? (s?.live ? "Trial nights are on for this room 🌙" : "Saved. Renters see it once trial nights go live.") : "Trial nights are off.");
    } catch (e) {
      setMsg(errText(e));
    }
  }
  return (
    <div className={`${card} md:col-span-2`} data-testid="trial-owner">
      <label className="flex items-center gap-3 font-semibold">
        <input type="checkbox" checked={s.enabled} onChange={(e) => void save(e.target.checked)} /> Offer trial nights
      </label>
      <p className="mt-1 text-sm text-muted">
        Students can stay 1 to {TRIAL_MAX_NIGHTS} nights before signing up. They pay you the nightly price directly; check their photo ID on arrival. Roomeo charges the student {feeLine(s.fee)} per trial booking.
      </p>
      {s.live ? null : (
        <p className="mt-2 rounded-xl border border-line bg-paper p-3 text-sm" data-testid="trial-not-live">
          Heads up: trial nights aren't live for renters yet. Set it up now and it switches on at launch.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label>
          <span className="mb-1 block text-sm text-muted">Nightly price (₹)</span>
          <input className={input} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} />
        </label>
        <button type="button" className={btnSmallPrimary} onClick={() => void save(true)}>Save price</button>
      </div>
      {msg ? <p className="mt-2 text-sm" role="status">{msg}</p> : null}
    </div>
  );
}

/** Student booking card on the listing page. Hidden unless the flag is on and the owner opted in. */
export function TrialNightsBooking({ listingId }: { listingId: string }) {
  const [t, setT] = useState<Awaited<ReturnType<typeof getListingTrial>> | null>(null);
  const [checkIn, setCheckIn] = useState("");
  const [nights, setNights] = useState(1);
  const [pay, setPay] = useState<Awaited<ReturnType<typeof startTrialBooking>> | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    void getListingTrial({ data: listingId }).then(setT).catch(() => setT(null));
  }, [listingId]);
  if (!t?.available) return null;
  async function book() {
    setErr("");
    try {
      setPay(await startTrialBooking({ data: { listingId, checkIn, nights } }));
    } catch (e) {
      setErr(errText(e));
    }
  }
  return (
    <div className={`${card} mt-4`} data-testid="trial-booking">
      <h3 className="font-display text-xl">Try a trial night</h3>
      <p className="text-sm text-muted">₹{t.nightlyInr}/night, paid to the owner. 1 to {t.maxNights} nights.</p>
      <div className={`${inner} mt-2 text-sm`}>
        <p>Roomeo service fee: <strong>₹{t.fee.total}</strong> once per booking, not per night</p>
        <p className="text-muted">₹{t.fee.base.toFixed(2)} + ₹{t.fee.gst.toFixed(2)} GST (18%) = ₹{t.fee.total.toFixed(2)}</p>
        <p className="mt-1">Stay: ₹{t.nightlyInr} × {nights} = ₹{t.nightlyInr * nights}, paid directly to the owner</p>
      </div>
      {!pay ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label>
            <span className="mb-1 block text-sm text-muted">Check-in</span>
            <input className={input} type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-sm text-muted">Nights</span>
            <select className={input} value={nights} onChange={(e) => setNights(Number(e.target.value))}>
              {Array.from({ length: t.maxNights }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button type="button" className={btnSmallPrimary} onClick={() => void book()}>Book trial · pay ₹{t.fee.total}</button>
        </div>
      ) : (
        <div className="mt-3 text-sm">
          <p>Pay ₹{pay.feeInr} to {pay.payee} ({pay.vpa}), note <strong>{pay.paymentRef}</strong>. We confirm once an operator approves it.</p>
          <img src={pay.qr} alt="UPI QR code" className="mt-2 h-48 w-48" />
          <a className={`${btnSmall} mt-2`} href={pay.link}>Open UPI app</a>
        </div>
      )}
      {err ? <p className="mt-2 text-sm text-danger" role="alert">{err}</p> : null}
      <ul className="mt-3 list-disc pl-5 text-sm">
        {t.checklist.map((c) => <li key={c}>{c}</li>)}
      </ul>
    </div>
  );
}

/** Owner ticks "ID checked" on arrival. */
export function TrialIdCheckButton({ bookingId }: { bookingId: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={btnSmall} disabled={done} onClick={() => void confirmTrialIdChecked({ data: { bookingId } }).then(() => setDone(true))}>
      {done ? "ID checked ✓" : "Mark ID checked"}
    </button>
  );
}
