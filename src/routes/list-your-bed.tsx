import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, CheckCircle, IdentificationCard, ShieldCheck } from "@phosphor-icons/react";
import { Shell } from "@/components/shell";
import { HostIdReview } from "@/components/host-id-review";
import { readPhotos } from "@/components/photo-upload";
import { btnPrimary, btnSmall, card, errorBox, input, linkCls, skeleton } from "@/components/ui-tokens";
import { errText } from "@/lib/ui-text";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { myBedIntakes, submitBedIntake } from "@/lib/roomsetu/account-api";
import { AREA_PINCODES, INTAKE_AREAS, INTAKE_PROPERTY_TYPES, intakePincode } from "@/lib/roomsetu/intake";
import { DECLARATION_REQUIRED, OWNER_DECLARATION, OWNER_ONLY_NOTICE } from "@/lib/roomsetu/owner-only";
import { normalizePhone } from "@/lib/roomsetu/waitlist";
import { currentUtm, trackEvent } from "@/lib/analytics/client";
import { inr } from "@/lib/roomsetu/map";

const DESCRIPTION = "Own a spare bed in Bengaluru? Send your phone, area, photos, price per bed and deposit in two minutes. We check your ID before the bed goes live. No broker, no listing fee.";

export const Route = createFileRoute("/list-your-bed")({
  head: () => pageHead("List your spare bed in Bengaluru", { description: DESCRIPTION, path: "/list-your-bed" }),
  component: ListYourBed,
});

const STEPS: [typeof Camera, string, string][] = [
  [Camera, "Send the basics", "Phone, area, a few photos, price per bed and deposit."],
  [IdentificationCard, "We check your ID", "Usually within a day. Your bed stays hidden until then."],
  [CheckCircle, "Go live", "Verified beds show in search and on the home page."],
];

type Status = Awaited<ReturnType<typeof myBedIntakes>>;

function ListYourBed() {
  const { user, isPending } = useCurrentUserState();
  const [sent, setSent] = useState<Status | null>(null);
  const [loaded, setLoaded] = useState(false);
  function loadStatus() {
    return myBedIntakes()
      .then((s) => setSent(s.beds.length ? s : null))
      .catch(() => setSent(null))
      .finally(() => setLoaded(true));
  }
  useEffect(() => {
    if (user) void loadStatus();
  }, [user]);

  return (
    <Shell>
      <section className="pt-6" aria-labelledby="lyb-h">
        <p className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-deep">
          <ShieldCheck size={16} weight="fill" aria-hidden /> Owners only, ID checked
        </p>
        <h1 id="lyb-h" className="mt-3 max-w-[680px] text-4xl [text-wrap:balance] sm:text-5xl">
          List your spare bed.
          <span className="block text-muted">We do the checking.</span>
        </h1>
        <p className="mt-3 max-w-[680px] text-base text-muted [text-wrap:pretty]">
          We&apos;re onboarding owners in Bengaluru now. Send your bed in two minutes; it goes live once the roomeo team has checked your ID.
        </p>
      </section>

      <ol className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="How it works">
        {STEPS.map(([Icon, title, body], i) => (
          <li key={title} className={card}>
            <Icon size={24} weight="duotone" className="text-brand" aria-hidden />
            <p className="mt-2 font-semibold">
              {i + 1}. {title}
            </p>
            <p className="mt-1 text-sm text-muted [text-wrap:pretty]">{body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-8">
        {isPending ? (
          <div className={`h-64 ${skeleton}`} aria-busy="true" aria-label="Loading" />
        ) : !user ? (
          <div className={card} data-testid="lyb-signin">
            <p className="font-semibold">Sign in to send your bed</p>
            <p className="mt-1 text-sm text-muted">Your bed, photos and ID status stay on your account.</p>
            <button
              type="button"
              className={`mt-4 ${btnPrimary}`}
              onClick={() => {
                sessionStorage.setItem("roomsetu-next", "/list-your-bed");
                window.location.href = "/login";
              }}
            >
              Sign in to list your bed
            </button>
          </div>
        ) : !loaded ? (
          <div className={`h-64 ${skeleton}`} aria-busy="true" aria-label="Loading" />
        ) : sent ? (
          <SentStatus data={sent} onChange={() => void loadStatus()} />
        ) : (
          <IntakeForm onSent={() => void loadStatus()} />
        )}
      </div>
    </Shell>
  );
}

function SentStatus({ data, onChange }: { data: Status; onChange: () => void }) {
  const live = data.status.key === "live";
  return (
    <section aria-labelledby="lyb-status-h">
      <div className={`${card} ${live ? "" : "border-marigold"}`} role="status" data-testid="intake-status">
        <p id="lyb-status-h" className="text-sm text-muted">Your bed</p>
        <p className="mt-1 text-2xl font-semibold" data-testid="intake-status-label">{data.status.label}</p>
        <p className="mt-1 text-sm text-muted [text-wrap:pretty]">{data.status.detail}</p>
        <ul className="mt-3 space-y-2">
          {data.beds.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-lg bg-paper p-3 text-sm">
              <span className="font-semibold [text-wrap:pretty]">{b.title}</span>
              <span className="shrink-0 tabular-nums">{inr(b.rent)} a bed</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/listing/$id" params={{ id: data.beds[0].id }} className={btnSmall}>
            {live ? "See it live" : "Preview (only you can see it)"}
          </Link>
          <Link to="/verification" className={btnSmall}>Verify your phone</Link>
        </div>
      </div>
      {live ? null : <HostIdReview onChange={onChange} />}
    </section>
  );
}

function IntakeForm({ onSent }: { onSent: () => void }) {
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [area, setArea] = useState<string>(INTAKE_AREAS[0]);
  const [otherArea, setOtherArea] = useState("");
  const [pincode, setPincode] = useState("");
  const [propertyType, setPropertyType] = useState<string>("PG");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [photos, setPhotos] = useState<{ url: string; category: string }[]>([]);
  const [declared, setDeclared] = useState(false);
  const [error, setError] = useState("");
  const [field, setField] = useState("");
  const [busy, setBusy] = useState(false);
  const isBlr = city.trim().toLowerCase() === "bengaluru" || city.trim().toLowerCase() === "bangalore";
  const areaName = isBlr && area !== "__other" ? area : otherArea.trim();
  const needsPin = !AREA_PINCODES[areaName];

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    const { added, error: bad } = await readPhotos(list, Math.max(0, 6 - photos.length));
    if (bad) setError(bad);
    setPhotos((cur) => [...cur, ...added].slice(0, 6));
  }

  function check(): [string, string] | null {
    if (!normalizePhone(phone)) return ["phone", "Enter a 10 digit Indian mobile number."];
    if (areaName.length < 2) return ["area", "Pick or type the area."];
    if (needsPin && !intakePincode(areaName, pincode)) return ["pincode", "Pincode should be 6 digits."];
    const r = Number(rent);
    if (!r || r < 1500 || r > 500000) return ["rent", "Price per bed should be between ₹1,500 and ₹5,00,000 a month."];
    const d = Number(deposit || 0);
    if (d < 0 || d > r * 12) return ["deposit", "Deposit looks off. Keep it under 12 months of rent."];
    if (!photos.length) return ["photos", "Add at least one photo of the bed."];
    if (!declared) return ["declared", DECLARATION_REQUIRED];
    return null;
  }

  const label = "mb-1 block text-sm font-semibold";
  const bad = (k: string) => (field === k ? " border-danger" : "");
  return (
    <form
      className={`${card} grid gap-4`}
      noValidate
      data-testid="intake-form"
      onSubmit={(e) => {
        e.preventDefault();
        const problem = check();
        if (problem) {
          setField(problem[0]);
          setError(problem[1]);
          return;
        }
        setField("");
        setError("");
        setBusy(true);
        void submitBedIntake({
          data: { phone, city, area: areaName, pincode, propertyType, monthlyRent: Number(rent), deposit: Number(deposit || 0), photos, ownerDeclared: declared, utm: currentUtm() },
        })
          .then((res) => {
            trackEvent("listing_created", { city, listing_kind: "bed", listing_id: res.id, source: "intake" });
            onSent();
          })
          .catch((err) => {
            setError(errText(err));
            setBusy(false);
          });
      }}
    >
      <h2 className="text-xl font-semibold">Your bed</h2>
      <p className="flex items-start gap-2 rounded-lg bg-paper p-3 text-sm [text-wrap:pretty]" data-testid="owner-only-notice">
        <ShieldCheck size={20} weight="bold" className="mt-0.5 shrink-0 text-brand" aria-hidden />
        <span>{OWNER_ONLY_NOTICE}</span>
      </p>
      <label>
        <span className={label}>Your mobile number</span>
        <input className={input + bad("phone")} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={field === "phone"} name="phone" />
        <span className="mt-1 block text-xs text-muted">Only the roomeo team sees it. Seekers never get your number from us.</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={label}>City</span>
          <input className={input} value={city} onChange={(e) => setCity(e.target.value)} name="city" />
        </label>
        {isBlr ? (
          <label>
            <span className={label}>Area</span>
            <select className={input + bad("area")} value={area} onChange={(e) => setArea(e.target.value)} name="area" aria-label="Area">
              {INTAKE_AREAS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
              <option value="__other">Another area</option>
            </select>
          </label>
        ) : null}
        {!isBlr || area === "__other" ? (
          <label>
            <span className={label}>Area name</span>
            <input className={input + bad("area")} value={otherArea} onChange={(e) => setOtherArea(e.target.value)} placeholder="Indiranagar" name="otherArea" />
          </label>
        ) : null}
        {needsPin ? (
          <label>
            <span className={label}>Pincode</span>
            <input className={input + bad("pincode")} inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} placeholder="560038" name="pincode" />
          </label>
        ) : null}
      </div>
      <fieldset>
        <legend className={label}>Kind of place</legend>
        <div className="flex flex-wrap gap-2">
          {INTAKE_PROPERTY_TYPES.map((t) => (
            <button key={t} type="button" aria-pressed={propertyType === t} onClick={() => setPropertyType(t)} className={`${btnSmall} ${propertyType === t ? "border-ink bg-ink text-card" : ""}`}>
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-4">
        <label>
          <span className={label}>Price per bed / month</span>
          <input className={input + bad("rent")} inputMode="numeric" placeholder="₹ 7,999" value={rent} onChange={(e) => setRent(e.target.value.replace(/\D/g, ""))} name="rent" />
        </label>
        <label>
          <span className={label}>Deposit</span>
          <input className={input + bad("deposit")} inputMode="numeric" placeholder="₹ 7,999" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ""))} name="deposit" />
        </label>
      </div>
      <div>
        <span className={label}>Photos of the bed and room</span>
        <label className={`${btnSmall} cursor-pointer${bad("photos")}`}>
          <Camera size={18} aria-hidden /> {photos.length ? "Add more photos" : "Add photos"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            data-testid="intake-photos"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {photos.length ? (
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <li key={p.url.slice(0, 48) + i} className="relative overflow-hidden rounded-lg border border-line">
                <img src={p.url} alt={`Photo ${i + 1} of your bed`} className="aspect-[4/3] w-full object-cover" />
                <button type="button" className="absolute right-1 top-1 rounded-full bg-card px-2 text-xs font-semibold" onClick={() => setPhotos((cur) => cur.filter((_, n) => n !== i))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted">Up to 6. Real photos, taken this month, work best.</p>
        )}
      </div>
      <label className={`flex items-start gap-3 rounded-lg border border-line p-3 text-sm${bad("declared")}`} data-testid="owner-declaration">
        <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]" />
        <span className="[text-wrap:pretty]">{OWNER_DECLARATION}</span>
      </label>
      {error ? <p className={errorBox} role="alert" data-testid="intake-error">{error}</p> : null}
      <button type="submit" className={btnPrimary} disabled={busy} data-testid="intake-submit">
        {busy ? "Sending…" : "Send my bed for ID review"}
      </button>
      <p className="text-xs text-muted">
        Free to list. Prefer the long form? <Link to="/create-listing" className={linkCls}>Use the full listing page</Link>
      </p>
    </form>
  );
}
