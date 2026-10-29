import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { control } from "@/components/cards";
import { EMPTY_TRUST, TrustFields, trustPayload, type TrustForm } from "@/components/trust-fields";
import {
  CATALOG_PHOTOS,
  FURNISHED,
  GENDER_PREFS,
  OCCUPATION_PREFS,
  PHOTO_CATEGORIES,
  PROPERTY_TYPES,
  ROOM_TYPES,
} from "@/lib/roomsetu/constants";
import { listCities } from "@/lib/roomsetu/public-api";
import { readPhotos } from "@/components/photo-upload";
import { createListing } from "@/lib/roomsetu/account-api";

export const Route = createFileRoute("/create-listing")({
  head: () => pageHead("List a spare bed"),
  component: () => (
    <NeedAccount next="/create-listing">
      <CreateListing />
    </NeedAccount>
  ),
});

function CreateListing() {
  const navigate = useNavigate();
  const [cities, setCities] = useState<{ name: string; localities: string[] }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<number[]>([]);
  const [uploads, setUploads] = useState<{ url: string; category: string }[]>([]);
  const [trust, setTrust] = useState<TrustForm>(EMPTY_TRUST);
  const [form, setForm] = useState({
    title: "",
    propertyType: "Apartment",
    address: "",
    city: "Bengaluru",
    locality: "Koramangala",
    pincode: "560034",
    monthlyRent: "15000",
    deposit: "30000",
    availableFrom: "",
    minStay: "3",
    maxStay: "12",
    roomType: "Private room",
    furnished: "Furnished",
    genderPref: "ANY",
    occupationPref: "ANY",
    occupants: "1",
    listingKind: "BED",
    bedrooms: "2",
    description: "",
    guestPolicy: "Occasional guests with a day's notice",
    agePref: "18 to 40",
    roommatePref: "Quiet on weeknights",
    wifi: true,
    kitchen: true,
    ac: false,
    washingMachine: false,
    parking: false,
    powerBackup: false,
    lift: false,
    housekeeping: false,
    food: false,
    attachedBath: true,
    balcony: false,
    smoking: false,
    pets: false,
  });

  useEffect(() => {
    void listCities().then((rows) => {
      setCities(rows);
      const first = rows[0];
      if (first) setForm((f) => ({ ...f, city: first.name, locality: first.localities[0] ?? "" }));
    });
  }, []);

  const localities = cities.find((c) => c.name === form.city)?.localities ?? [];
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    const { added, error: bad } = await readPhotos(list, Math.max(0, 6 - uploads.length));
    if (bad) setError(bad);
    setUploads((cur) => [...cur, ...added].slice(0, 6));
  }

  const toggles: { key: keyof typeof form; label: string }[] = [
    { key: "wifi", label: "WiFi" },
    { key: "kitchen", label: "Kitchen" },
    { key: "ac", label: "AC" },
    { key: "attachedBath", label: "Attached bath" },
    { key: "balcony", label: "Balcony" },
    { key: "washingMachine", label: "Washing machine" },
    { key: "parking", label: "Parking" },
    { key: "powerBackup", label: "Power backup" },
    { key: "lift", label: "Lift" },
    { key: "housekeeping", label: "Housekeeping" },
    { key: "food", label: "Food" },
    { key: "smoking", label: "Smoking allowed" },
    { key: "pets", label: "Pets allowed" },
  ];

  return (
    <Shell>
      <h1 className="font-display text-4xl">List a room</h1>
      <p className="mt-2 max-w-xl text-muted">
        Tell the truth about the room. You can pause it later when someone moves in.
      </p>
      <form
        className="mt-6 grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          void createListing({
            data: {
              ...form,
              ...trustPayload(trust),
              monthlyRent: Number(form.monthlyRent),
              deposit: Number(form.deposit),
              minStay: Number(form.minStay),
              maxStay: Number(form.maxStay),
              occupants: Number(form.occupants),
              listingKind:
                form.listingKind === "ENTIRE_FLAT" ? ("ENTIRE_FLAT" as const) : ("BED" as const),
              bedrooms: Number(form.bedrooms),
              photos: [...uploads, ...photos.map((i) => CATALOG_PHOTOS[i])].slice(0, 8),
            },
          })
            .then((res) => navigate({ to: "/listing/$id", params: { id: res.id } }))
            .catch((err) => {
              setError(errText(err));
              setBusy(false);
            });
        }}
      >
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm text-muted">Title</span>
          <input
            className={control}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            required
            placeholder="Private room near the metro"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Property</span>
          <select
            className={control}
            value={form.propertyType}
            onChange={(e) => set("propertyType", e.target.value)}
          >
            {PROPERTY_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">What are you letting?</span>
          <select
            className={control}
            value={form.listingKind}
            onChange={(e) => set("listingKind", e.target.value)}
            aria-label="Listing type"
          >
            <option value="BED">A single bed / room</option>
            <option value="ENTIRE_FLAT">The entire flat (for a squad)</option>
          </select>
        </label>
        {form.listingKind === "ENTIRE_FLAT" ? (
          <label>
            <span className="mb-1 block text-sm text-muted">Bedrooms</span>
            <select
              className={control}
              value={form.bedrooms}
              onChange={(e) => set("bedrooms", e.target.value)}
              aria-label="Bedrooms"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span className="mb-1 block text-sm text-muted">Room type</span>
          <select
            className={control}
            value={form.roomType}
            onChange={(e) => set("roomType", e.target.value)}
          >
            {ROOM_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">City</span>
          <select
            className={control}
            value={form.city}
            onChange={(e) => {
              const city = e.target.value;
              const loc = cities.find((c) => c.name === city)?.localities[0] ?? "";
              setForm((f) => ({ ...f, city, locality: loc }));
            }}
          >
            {cities.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Locality</span>
          <select
            className={control}
            value={form.locality}
            onChange={(e) => set("locality", e.target.value)}
          >
            {localities.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm text-muted">
            Street address (shown only after you sign in)
          </span>
          <input
            className={control}
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            required
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Pincode</span>
          <input
            className={control}
            value={form.pincode}
            onChange={(e) => set("pincode", e.target.value)}
            required
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Furnished</span>
          <select
            className={control}
            value={form.furnished}
            onChange={(e) => set("furnished", e.target.value)}
          >
            {FURNISHED.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Monthly rent</span>
          <input
            className={control}
            inputMode="numeric"
            value={form.monthlyRent}
            onChange={(e) => set("monthlyRent", e.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Deposit</span>
          <input
            className={control}
            inputMode="numeric"
            value={form.deposit}
            onChange={(e) => set("deposit", e.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
        <TrustFields value={trust} onChange={(k, v) => setTrust((t) => ({ ...t, [k]: v }))} />
        <label>
          <span className="mb-1 block text-sm text-muted">Available from</span>
          <input
            className={control}
            type="date"
            value={form.availableFrom}
            onChange={(e) => set("availableFrom", e.target.value)}
            required
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Minimum stay (months)</span>
          <input
            className={control}
            value={form.minStay}
            onChange={(e) => set("minStay", e.target.value)}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">For</span>
          <select
            className={control}
            value={form.genderPref}
            onChange={(e) => set("genderPref", e.target.value)}
          >
            {GENDER_PREFS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Occupation preference</span>
          <select
            className={control}
            value={form.occupationPref}
            onChange={(e) => set("occupationPref", e.target.value)}
          >
            {OCCUPATION_PREFS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">People already living here</span>
          <input
            className={control}
            value={form.occupants}
            onChange={(e) => set("occupants", e.target.value)}
          />
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm text-muted">About the room</span>
          <textarea
            className="w-full rounded-xl border border-line bg-paper p-3"
            rows={4}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <div className="md:col-span-2">
          <p className="mb-2 text-sm text-muted">House</p>
          <div className="flex flex-wrap gap-2">
            {toggles.map((t) => {
              const on = Boolean(form[t.key]);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, [t.key]: !on }))}
                  className={`h-10 rounded-full px-3 text-sm font-medium ${on ? "bg-brand text-card" : "border border-line bg-card"}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="md:col-span-2">
          <p className="mb-2 text-sm text-muted">
            Photographs of the room. Upload your own, or pick a sample if you are just trying the
            flow.
          </p>
          <label className="inline-flex h-12 cursor-pointer items-center rounded-full bg-brand px-4 text-sm font-semibold text-card">
            Upload photographs
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {uploads.length ? (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {uploads.map((photo, i) => (
                <div
                  key={photo.url.slice(0, 48) + i}
                  className="relative overflow-hidden rounded-xl border border-brand"
                >
                  <img src={photo.url} alt="" className="aspect-[4/3] w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded-full bg-card px-2 text-xs font-semibold"
                    onClick={() => setUploads((cur) => cur.filter((_, n) => n !== i))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <p className="mb-2 mt-4 text-sm text-muted">Sample photos</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {CATALOG_PHOTOS.map((p, i) => {
              const on = photos.includes(i);
              return (
                <button
                  key={p.url}
                  type="button"
                  onClick={() =>
                    setPhotos((cur) => (on ? cur.filter((n) => n !== i) : [...cur, i].slice(0, 6)))
                  }
                  className={`overflow-hidden rounded-xl border ${on ? "border-brand" : "border-line"}`}
                >
                  <img src={p.url} alt={p.category} className="aspect-[4/3] w-full object-cover" />
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            Categories used: {PHOTO_CATEGORIES.slice(0, 4).join(", ")}.
          </p>
        </div>
        {error ? <p className="text-sm text-danger md:col-span-2">{error}</p> : null}
        <button
          disabled={busy}
          className="h-12 rounded-full bg-brand font-semibold text-card md:col-span-2 disabled:opacity-60"
          type="submit"
        >
          {busy ? "Publishing…" : "Publish room"}
        </button>
      </form>
    </Shell>
  );
}
