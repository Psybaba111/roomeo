import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera, CheckCircle, Trash } from "@phosphor-icons/react";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { control } from "@/components/cards";
import { EMPTY_TRUST, TrustFields, trustPayload, type TrustForm } from "@/components/trust-fields";
import { btnPrimary, btnSecondary, btnSmall } from "@/components/ui-tokens";
import { readPhotos } from "@/components/photo-upload";
import { errText } from "@/lib/ui-text";
import { FURNISHED } from "@/lib/roomsetu/constants";
import { EDIT_AMENITIES, MAX_PHOTOS, type AmenityKey } from "@/lib/roomsetu/listing-edit";
import { getListingForEdit, updateListing } from "@/lib/roomsetu/listing-edit-api";

export const Route = createFileRoute("/edit-listing/$id")({
  head: () => pageHead("Edit your room", { noindex: true }),
  component: EditListingPage,
});

function EditListingPage() {
  const { id } = Route.useParams();
  return (
    <NeedAccount next={`/edit-listing/${id}`}>
      <EditListing id={id} />
    </NeedAccount>
  );
}

type Loaded = Awaited<ReturnType<typeof getListingForEdit>>;
type Photo = { id?: string; url: string; category: string };

function EditListing({ id }: { id: string }) {
  const navigate = useNavigate();
  const [room, setRoom] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ monthlyRent: "", deposit: "", description: "", furnished: "Furnished", availableFrom: "" });
  const [trust, setTrust] = useState<TrustForm>(EMPTY_TRUST);
  const [amenities, setAmenities] = useState<Record<AmenityKey, boolean> | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    void getListingForEdit({ data: { id } })
      .then((r) => {
        setRoom(r);
        setForm({ monthlyRent: String(r.monthlyRent), deposit: String(r.deposit), description: r.description, furnished: r.furnished, availableFrom: r.availableFrom });
        setTrust({ allInInr: r.trust.allInInr ? String(r.trust.allInInr) : "", allInIncludes: r.trust.allInIncludes, videoTourUrl: r.trust.videoTourUrl, depositRefundDays: String(r.trust.depositRefundDays) });
        setAmenities(r.amenities);
        setPhotos(r.photos);
      })
      .catch((e) => setError(errText(e)));
  }, [id]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    const { added, error: bad } = await readPhotos(list, Math.max(0, MAX_PHOTOS - photos.length));
    if (bad) setError(bad);
    setPhotos((cur) => [...cur, ...added].slice(0, MAX_PHOTOS));
  }

  function save() {
    if (!amenities) return;
    setBusy(true);
    setError("");
    setNotice("");
    void updateListing({
      data: {
        id,
        monthlyRent: Number(form.monthlyRent),
        deposit: Number(form.deposit),
        description: form.description,
        furnished: form.furnished,
        availableFrom: form.availableFrom,
        amenities,
        ...trustPayload(trust),
        keepPhotoIds: photos.filter((p) => p.id).map((p) => p.id as string),
        newPhotos: photos.filter((p) => !p.id).map((p) => ({ url: p.url, category: p.category })),
      },
    })
      .then(() => getListingForEdit({ data: { id } }))
      .then((r) => {
        setRoom(r);
        setPhotos(r.photos);
        setNotice("Saved. Your room is up to date.");
      })
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(false));
  }

  if (!room) {
    return (
      <Shell>
        <div className="pt-6">
          {error ? (
            <p role="alert" className="rounded-3xl border border-line bg-card p-4 text-danger">{error}</p>
          ) : (
            <p className="text-muted">Loading your room…</p>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="pt-6">
        <Link to={room.asAdmin ? "/admin/listings" : "/dashboard"} className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
          <ArrowLeft size={16} aria-hidden /> {room.asAdmin ? "Operator rooms" : "Your rooms"}
        </Link>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Edit your room</h1>
        <p className="mt-2 max-w-xl text-muted">
          {room.title} · {room.locality}, {room.city} · {room.status === "ACTIVE" ? "Live" : room.status.toLowerCase()}
        </p>
        {room.asAdmin ? (
          <p className="mt-4 rounded-2xl bg-pop-soft px-4 py-3 text-sm font-semibold text-pop">Operator edit. This change is written to the audit log.</p>
        ) : null}
      </div>
      <form
        className="mt-6 grid gap-4 md:grid-cols-2"
        aria-label="Edit room"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          <span className="mb-1 block text-sm text-muted">Rent per month (₹)</span>
          <input className={control} inputMode="numeric" name="monthlyRent" value={form.monthlyRent} onChange={(e) => set("monthlyRent", e.target.value.replace(/[^\d]/g, ""))} required />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Deposit (₹)</span>
          <input className={control} inputMode="numeric" name="deposit" value={form.deposit} onChange={(e) => set("deposit", e.target.value.replace(/[^\d]/g, ""))} required />
        </label>
        <TrustFields value={trust} onChange={(k, v) => setTrust((t) => ({ ...t, [k]: v }))} />
        <label>
          <span className="mb-1 block text-sm text-muted">Furnished</span>
          <select className={control} name="furnished" value={form.furnished} onChange={(e) => set("furnished", e.target.value)}>
            {FURNISHED.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Free from</span>
          <input className={control} type="date" name="availableFrom" value={form.availableFrom} onChange={(e) => set("availableFrom", e.target.value)} required />
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm text-muted">About the room</span>
          <textarea className="w-full rounded-xl border border-line bg-paper p-3" rows={5} name="description" maxLength={800} value={form.description} onChange={(e) => set("description", e.target.value)} />
          <span className="mt-1 block text-xs text-muted">{form.description.length}/800. Say what's included and the house rules.</span>
        </label>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-sm text-muted">What's in the house</legend>
          <div className="flex flex-wrap gap-2">
            {EDIT_AMENITIES.map((a) => {
              const on = Boolean(amenities?.[a.key]);
              return (
                <button
                  key={a.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAmenities((cur) => (cur ? { ...cur, [a.key]: !on } : cur))}
                  className={`h-10 rounded-full px-4 text-sm font-medium ${on ? "bg-brand text-card" : "border border-line bg-card"}`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <section className="md:col-span-2" aria-labelledby="photos-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="photos-h" className="text-xl font-semibold">Photos <span className="text-sm font-normal text-muted">{photos.length}/{MAX_PHOTOS}</span></h2>
            <label className={`${btnSmall} cursor-pointer`}>
              <Camera size={16} aria-hidden /> Add photos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                data-testid="edit-photo-input"
                disabled={photos.length >= MAX_PHOTOS}
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="mt-1 text-sm text-muted">Real photos get way more chats. The first one is the cover.</p>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="edit-photos">
            {photos.map((p, i) => (
              <li key={(p.id ?? p.url.slice(-40)) + i} className="relative overflow-hidden rounded-2xl border border-line">
                <img src={p.url} alt={`${p.category} photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                {i === 0 ? <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-1 text-xs font-semibold text-card">Cover</span> : null}
                {!p.id ? <span className="absolute bottom-2 left-2 rounded-full bg-card px-2 py-1 text-xs font-semibold">New</span> : null}
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  disabled={photos.length <= 1}
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-card text-danger"
                  onClick={() => setPhotos((cur) => cur.filter((_, n) => n !== i))}
                >
                  <Trash size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
        {error ? <p role="alert" className="text-sm text-danger md:col-span-2">{error}</p> : null}
        {notice ? (
          <p role="status" className="inline-flex items-center gap-2 text-sm font-semibold text-brand md:col-span-2">
            <CheckCircle size={16} weight="fill" aria-hidden /> {notice}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className={btnSecondary} onClick={() => void navigate({ to: "/listing/$id", params: { id } })}>
            View room
          </button>
        </div>
      </form>
    </Shell>
  );
}
