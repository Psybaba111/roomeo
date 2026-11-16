import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { control } from "@/components/cards";
import { joinWaitlist } from "@/lib/roomsetu/waitlist-api";
import { WAITLIST_CONSENT, WAITLIST_ROLES, splitContact, type WaitlistRole, type WaitlistSource } from "@/lib/roomsetu/waitlist";
import { isComplete, ROOMIE_TYPES, roomieTypeFor, type RoomieTypeKey } from "@/lib/roomsetu/roomie-quiz";
import { readRoomieDraft } from "@/lib/roomsetu/roomie-draft";
import { errText } from "@/lib/ui-text";

export const ROOMIE_TYPE_EVENT = "roomeo:roomie-type";

function draftType(): RoomieTypeKey | null {
  const d = readRoomieDraft();
  return isComplete(d) ? roomieTypeFor(d) : null;
}

/** Pre-launch waitlist sign-up. Picks up the quiz result from this tab (type key only) and saves it with the sign-up. */
export function WaitlistForm({ source = "home", defaultCity = "" }: { source?: WaitlistSource; defaultCity?: string }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [city, setCity] = useState(defaultCity);
  const [role, setRole] = useState<WaitlistRole>("tenant");
  const [consent, setConsent] = useState(false);
  const [type, setType] = useState<RoomieTypeKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"joined" | "updated" | null>(null);

  useEffect(() => {
    setType(draftType());
    const on = () => setType(draftType());
    window.addEventListener(ROOMIE_TYPE_EVENT, on);
    return () => window.removeEventListener(ROOMIE_TYPE_EVENT, on);
  }, []);

  const c = splitContact(contact);
  const contactOk = Boolean(c.email || c.phone);
  const ready = name.trim() && contactOk && city.trim() && consent && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      const r = await joinWaitlist({ data: { name, contact, city, role, consent: true, roomieType: type, source: type ? "quiz" : source } });
      setDone(r.status);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border-2 border-lime bg-card p-5" role="status" data-testid="waitlist-done">
        <p className="text-4xl" aria-hidden>
          🎟️
        </p>
        <h3 className="mt-2 font-display text-2xl">{done === "joined" ? "You're on the list!" : "You were already in. Details updated ✨"}</h3>
        <p className="mt-2 text-sm text-muted">
          {role === "owner"
            ? "We'll ping you before launch. Want a head start? You can already list your spare bed."
            : `We'll message you the moment beds open in ${city.trim() || "your city"}.`}
          {type ? ` Your ${ROOMIE_TYPES[type].name} type is saved with your spot.` : ""}
        </p>
        {role === "owner" ? (
          <Link to="/create-listing" className="mt-4 inline-flex h-12 items-center rounded-full bg-ink px-5 font-semibold text-card">
            List my spare bed →
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-3xl border border-line bg-card p-5" data-testid="waitlist-form" noValidate>
      {type ? (
        <p className="rounded-2xl px-3 py-2 text-sm font-semibold" style={{ background: ROOMIE_TYPES[type].colors.bg, color: ROOMIE_TYPES[type].colors.ink }} data-testid="waitlist-type">
          {ROOMIE_TYPES[type].emoji} Saving your type: {ROOMIE_TYPES[type].name}
        </p>
      ) : null}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">I'm joining as</legend>
        <div className="grid grid-cols-2 gap-2">
          {WAITLIST_ROLES.map((r) => (
            <label key={r.value} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 px-3 text-center text-sm font-semibold ${role === r.value ? "border-brand bg-brand-soft" : "border-line"}`}>
              <input type="radio" name="wl-role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="sr-only" data-testid={`waitlist-role-${r.value}`} />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Name</span>
        <input className={control} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} data-testid="waitlist-name" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Email or WhatsApp number</span>
        <input className={control} value={contact} onChange={(e) => setContact(e.target.value)} inputMode="email" autoComplete="email" placeholder="you@email.com or 98xxxxxxxx" maxLength={254} data-testid="waitlist-contact" />
        {contact && !contactOk ? <span className="mt-1 block text-xs text-danger">Add a valid email or 10-digit mobile.</span> : null}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">City</span>
        <input className={control} value={city} onChange={(e) => setCity(e.target.value)} list="wl-cities" autoComplete="address-level2" maxLength={60} data-testid="waitlist-city" />
        <datalist id="wl-cities">
          {["Mangaluru", "Bengaluru", "Mumbai", "Pune", "Hyderabad", "Chennai", "Delhi"].map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </label>
      <label className="flex items-start gap-3 text-xs text-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]" data-testid="waitlist-consent" />
        <span>
          {WAITLIST_CONSENT} See our{" "}
          <Link to="/privacy" className="font-semibold text-brand underline">
            privacy policy
          </Link>
          .
        </span>
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button type="submit" disabled={!ready} className="flex min-h-14 w-full items-center justify-center rounded-full bg-brand px-6 text-lg font-bold text-card disabled:opacity-50" data-testid="waitlist-submit">
        {busy ? "Saving your spot…" : "Join the waitlist →"}
      </button>
    </form>
  );
}

/** Homepage section: id="waitlist" is the target of every waitlist CTA. */
export function WaitlistSection({ city }: { city: string }) {
  return (
    <section id="waitlist" className="mt-8 scroll-mt-20" aria-labelledby="waitlist-h" data-testid="waitlist-section">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Launching soon 🚀</p>
      <h2 id="waitlist-h" className="mt-1 text-3xl sm:text-4xl">
        Get in before beds go live
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted">Early list gets first pick of verified beds, and owners get first listings in front of tenants. Free, no spam.</p>
      <div className="mt-4 max-w-xl">
        <WaitlistForm defaultCity={city} />
      </div>
    </section>
  );
}
