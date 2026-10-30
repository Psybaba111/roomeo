import { listingHead } from "@/lib/seo";
import { ContactGate } from "@/components/contact-gate";
import { SquadShortlistButton } from "@/components/squad-shortlist-button";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SealCheck as BadgeCheck } from "@phosphor-icons/react";
import { RentOnTimeBadge } from "@/components/rent-autopay";
import { Shell } from "@/components/shell";
import { errText, safeNext } from "@/lib/ui-text";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getListing } from "@/lib/roomsetu/public-api";
import {
  applyToListing,
  fileReport,
  getListingAddress,
  saveListing,
  unsaveListing,
  savedIds,
} from "@/lib/roomsetu/account-api";
import { REPORT_CATEGORIES } from "@/lib/roomsetu/constants";
import { genderLabel, inr, cardPhoto, whenLabel } from "@/lib/roomsetu/map";
import { ShareButtons } from "@/components/share-buttons";
import { REVIEWS_NOTE, depositTerms, headlinePrice, photoDateLabel } from "@/lib/roomsetu/trust";
import { SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/listing/$id")({
  loader: ({ params }) => getListing({ data: params.id }),
  head: ({ loaderData }) => listingHead(loaderData),
  component: ListingPage,
  notFoundComponent: GoneListing,
  errorComponent: ({ error }) => (
    <Shell>
      <h1 className="font-display text-4xl">Room unavailable</h1>
      <p className="mt-3 max-w-md text-muted">{errText(error)}</p>
      <Link
        to="/"
        className="mt-6 inline-flex h-12 items-center rounded-lg bg-ink px-4 font-semibold text-card shadow-[0_4px_0_var(--color-brand)]"
      >
        Back to beds →
      </Link>
    </Shell>
  ),
});

function GoneListing() {
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">404</p>
      <h1 className="mt-2 font-display text-4xl">This bed isn't available anymore</h1>
      <p className="mt-3 max-w-md text-muted">
        Someone grabbed it or the owner took it down. Plenty more beds where that came from.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex h-12 items-center rounded-lg bg-ink px-4 font-semibold text-card shadow-[0_4px_0_var(--color-brand)]"
      >
        Back to beds →
      </Link>
    </Shell>
  );
}

function ListingPage() {
  const room = Route.useLoaderData();
  if (room.held) {
    return (
      <Shell>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
          Not public yet
        </p>
        <h1 className="mt-2 text-4xl">This bed stays hidden</h1>
        <p className="mt-3 max-w-md text-muted">
          The owner has to pass the identity check before anyone else can open this bed.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-12 items-center rounded-lg bg-ink px-4 font-semibold text-card shadow-[0_4px_0_var(--color-brand)]"
        >
          Back to beds →
        </Link>
      </Shell>
    );
  }
  return <ListingBody room={room} />;
}

type LoadedRoom = Extract<Awaited<ReturnType<typeof getListing>>, { held: false }>;

function ListingBody({ room }: { room: LoadedRoom }) {
  const { user, isPending } = useCurrentUserState();
  const [photo, setPhoto] = useState(0);
  const [saved, setSaved] = useState(false);
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [category, setCategory] = useState<string>(REPORT_CATEGORIES[0]);

  useEffect(() => {
    if (!user) return;
    void savedIds()
      .then((ids) => setSaved(ids.includes(room.id)))
      .catch(() => undefined);
    void getListingAddress({ data: room.id })
      .then((a) => setAddress(`${a.address}, ${a.pincode}`))
      .catch(() => undefined);
  }, [user, room.id]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setError("");
    try {
      await fn();
      setMessage(ok);
    } catch (e) {
      setError(errText(e));
    }
  }

  const img = room.images[photo] ?? room.images[0];
  const facts = [
    ["Room", room.roomType],
    ["Furnished", room.furnished],
    ["Deposit", inr(room.deposit)],
    ["Available", whenLabel(room.availableFrom)],
    ["Stay", `${room.minStay}–${room.maxStay ?? "open"} mo`],
    ["People here", String(room.occupants)],
    ["For", genderLabel(room.genderPref)],
    ["Occupation", room.occupationPref === "ANY" ? "Anyone" : room.occupationPref],
  ];

  return (
    <Shell>
      {room.onlyYou ? (
        <p className="mb-6 rounded-[14px] border border-line bg-card p-4 text-sm shadow-[6px_6px_0_var(--color-brand)]">
          Only you can see this bed. It stays hidden from everyone else until your identity check
          passes.{" "}
          <Link to="/verification" className="font-semibold text-brand">
            Pass the check →
          </Link>
        </p>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded-3xl border border-line bg-brand-soft">
            {img ? (
              <img
                src={cardPhoto(img.url, 960) ?? img.url}
                alt=""
                width={960}
                height={720}
                decoding="async"
                fetchPriority="high"
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              <div className="aspect-[4/3]" />
            )}
          </div>
          {img ? (
            <p className="mt-2 text-xs text-muted" data-testid="photo-date">
              {photoDateLabel(img.uploadedAt) || "Older photo, upload date not recorded. Ask the owner for a fresh one."}
            </p>
          ) : null}
          {room.trust.videoTourUrl ? (
            <a href={room.trust.videoTourUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold" data-testid="video-tour-link">
              ▶ Watch the video tour
            </a>
          ) : null}
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {room.images.map((image, i) => (
              <button
                key={image.url + i}
                type="button"
                onClick={() => setPhoto(i)}
                className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border ${i === photo ? "border-brand" : "border-line"}`}
              >
                <img
                  src={cardPhoto(image.url, 160) ?? image.url}
                  alt={image.category}
                  width={160}
                  height={128}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{img?.category}</p>
        </div>
        <div className="lg:col-span-5">
          <div className="flex flex-wrap gap-2">
            {room.verification === "VERIFIED" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold text-brand-deep">
                <BadgeCheck className="h-3.5 w-3.5" /> Verified
              </span>
            ) : (
              <span className="rounded-full bg-paper px-2 py-1 text-xs font-semibold text-muted">
                Not verified yet
              </span>
            )}
            <RentOnTimeBadge listingId={room.id} />
            {room.isDemo ? (
              <span className="rounded-full bg-marigold-soft px-2 py-1 text-xs font-semibold text-ink">
                Demo
              </span>
            ) : null}
            {room.tier !== "FREE" ? (
              <span className="rounded-full bg-paper px-2 py-1 text-xs font-semibold">
                {room.tier}
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 font-display text-4xl leading-tight">{room.title}</h1>
          <p className="mt-2 text-muted">
            {room.locality}, {room.city} · {room.propertyType}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Vibe">
            {(room.vibes ?? []).map((v) => (
              <li
                key={v}
                className="rounded-full bg-pop-soft px-2 py-1 text-xs font-semibold text-pop"
              >
                {v}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <ShareButtons room={{ ...room, allInInr: room.trust.allInInr }} url={`${SITE_URL}/listing/${room.id}`} />
          </div>
          <p className="mt-4 text-4xl font-semibold tabular-nums text-trust" data-testid="headline-price">
            {inr(headlinePrice(room.rent, room.trust.allInInr).amount)}{" "}
            <span className="text-lg font-medium text-muted">/ month{room.trust.allInInr ? " all-in" : ""}</span>
          </p>
          {room.trust.allInInr ? (
            <p className="mt-1 text-sm text-muted" data-testid="all-in-includes">
              Includes {room.trust.allInIncludes}. Rent alone {inr(room.rent)}.
            </p>
          ) : null}
          <div className="mt-4 rounded-3xl bg-ink p-4 text-card">
            <p className="text-sm font-semibold text-brand">To move in</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {inr(room.rent)} rent + {inr(room.deposit)} deposit
            </p>
            <p className="mt-1 text-sm text-brand-soft">
              Rent and deposit go to the owner. Roomeo takes no cut. Chatting the owner is free.
            </p>
            <p className="mt-2 text-sm font-semibold" data-testid="deposit-terms">
              {depositTerms(room.deposit, room.trust.depositRefundDays)}
            </p>
            <p className="mt-1 text-xs text-brand-soft">{REVIEWS_NOTE}</p>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {user ? (
              <ContactGate listingId={room.id} isDemo={room.isDemo} />
            ) : (
              <button
                type="button"
                className="h-12 rounded-full bg-brand font-semibold text-card"
                onClick={() => {
                  sessionStorage.setItem("roomsetu-next", `/listing/${room.id}`);
                  window.location.href = "/login";
                }}
              >
                Sign in to message the owner
              </button>
            )}
            {user ? <SquadShortlistButton listingId={room.id} /> : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="h-12 rounded-full border border-line font-semibold"
                onClick={() => {
                  if (!user) {
                    sessionStorage.setItem("roomsetu-next", `/listing/${room.id}`);
                    window.location.href = "/login";
                    return;
                  }
                  void act(
                    async () => {
                      if (saved) {
                        await unsaveListing({ data: room.id });
                        setSaved(false);
                      } else {
                        await saveListing({ data: room.id });
                        setSaved(true);
                      }
                    },
                    saved ? "Removed from saved" : "Saved",
                  );
                }}
              >
                {saved ? "Saved" : "Save"}
              </button>
              <button
                type="button"
                className="h-12 rounded-full border border-line font-semibold"
                onClick={() => {
                  if (!user) {
                    window.location.href = "/login";
                    return;
                  }
                  void act(
                    () => applyToListing({ data: { id: room.id, note } }),
                    "You asked to join this bed. The owner says yes or no once.",
                  );
                }}
              >
                Join this bed
              </button>
            </div>
          </div>
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          {message ? <p className="mt-3 text-sm text-brand-deep">{message}</p> : null}
          <p className="mt-4 text-sm text-muted">
            Phone numbers stay hidden. {room.views} people have opened this room.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <p className="text-lg">{room.description}</p>
          <dl className="grid grid-cols-2 gap-3">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-line bg-card p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <h2 className="font-display text-2xl">In the house</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {room.amenities.map((a) => (
                <li
                  key={a}
                  className="rounded-full bg-brand-soft px-3 py-1 text-sm text-brand-deep"
                >
                  {a}
                </li>
              ))}
            </ul>
            <ul className="mt-4 space-y-1 text-sm text-muted">
              <li>
                {room.smoking ? "Smoking allowed" : "No smoking"} ·{" "}
                {room.pets ? "Pets considered" : "No pets"}
              </li>
              <li>{room.guestPolicy}</li>
              <li>
                Age: {room.agePref}. {room.roommatePref}
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">The room</h2>
            <p className="mt-2 text-sm text-muted">
              No visit. You judge this bed from the photos and the rent. The street stays off this
              page.
              {user && address ? ` The owner can share ${address} after they say yes.` : ""}
            </p>
          </div>
        </div>
        <aside className="lg:col-span-5">
          <div className="rounded-3xl border border-line bg-card p-4">
            <p className="text-sm text-muted">Host</p>
            <h2 className="font-display text-2xl">{room.host.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {room.host.occupation || "Occupation hidden"}
              {room.host.city ? ` · ${room.host.city}` : ""} · since {room.host.since}
            </p>
            {room.host.isDemo ? null : room.host.identitySource === "DIGILOCKER" ? (
              <p className="mt-2 text-sm font-semibold text-brand">Checked with DigiLocker</p>
            ) : room.host.identitySource === "STAFF" ? (
              <p className="mt-2 text-sm text-muted">Passed by the desk. Not a government check.</p>
            ) : (
              <p className="mt-2 text-sm text-muted">Identity not checked yet</p>
            )}
            <p className="mt-3">{room.host.about}</p>
            {room.host.isDemo ? (
              <p className="mt-3 text-sm text-muted">
                Sample host. A quick reply is sent so you can see messaging. It is not a live
                person.
              </p>
            ) : null}
            {room.host.lastSeen ? (
              <p className="mt-2 text-xs text-muted">
                Last active {room.host.lastSeen.slice(0, 16).replace("T", " ")}
              </p>
            ) : null}
          </div>
          <div className="mt-4">
            <button
              type="button"
              className="text-sm font-semibold text-danger"
              onClick={() => setReportOpen((v) => !v)}
            >
              Report this listing
            </button>
            {reportOpen ? (
              <form
                className="mt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!user && !isPending) {
                    sessionStorage.setItem("roomsetu-next", safeNext(`/listing/${room.id}`));
                    window.location.href = "/login";
                    return;
                  }
                  void act(
                    () =>
                      fileReport({
                        data: { targetType: "LISTING", targetId: room.id, category, note },
                      }),
                    "Report filed for review",
                  );
                }}
              >
                <select
                  className="h-12 w-full rounded-xl border border-line bg-paper px-3"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {REPORT_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <textarea
                  className="w-full rounded-xl border border-line bg-paper p-3"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What looks wrong?"
                />
                <button
                  className="h-11 rounded-full bg-ink px-4 text-sm font-semibold text-card"
                  type="submit"
                >
                  Send report
                </button>
              </form>
            ) : null}
          </div>
          <Link
            to="/search"
            search={{
              city: room.city,
              locality: "",
              maxRent: "",
              roomType: "",
              furnished: "",
              gender: "",
              food: "",
              kind: "",
              sort: "recommended",
              q: "",
              availableBy: "",
            }}
            className="mt-6 inline-block text-sm font-semibold text-brand"
          >
            More rooms in {room.city}
          </Link>
        </aside>
      </div>
    </Shell>
  );
}
