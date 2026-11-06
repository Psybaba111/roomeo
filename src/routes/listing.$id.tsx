import { LOCKED_LOCATION_LINE } from "@/lib/roomsetu/location-gate";
import { TrialNightsSheetBody } from "@/components/trial-nights";
import { FEE_UNDER_PRICE, REQUEST_CTA, REQUEST_CTA_SIGNED_OUT, isAlreadyRequested, requestSentLine } from "@/lib/roomsetu/booking-cta";
import { listingHead } from "@/lib/seo";
import { ContactGate } from "@/components/contact-gate";
import { SquadShortlistButton } from "@/components/squad-shortlist-button";
import { mySquads } from "@/lib/roomsetu/squad-api";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SealCheck as BadgeCheck, BookmarkSimple, ChatCircleDots, DotsThree, Flag, ShareNetwork, CalendarBlank, Ticket, ArrowSquareOut, UsersThree } from "@phosphor-icons/react";
import { Shell } from "@/components/shell";
import { errText, safeNext } from "@/lib/ui-text";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getListing } from "@/lib/roomsetu/public-api";
import {
  applyToListing,
  fileReport,
  openConversation,
  saveListing,
  unsaveListing,
  savedIds,
} from "@/lib/roomsetu/account-api";
import { REPORT_CATEGORIES } from "@/lib/roomsetu/constants";
import { genderLabel, inr, cardPhoto, whenLabel } from "@/lib/roomsetu/map";
import { ShareButtons } from "@/components/share-buttons";
import { Sheet } from "@/components/sheet";
import { shareNative, shareText, whatsappShareUrl } from "@/lib/share";
import { depositTerms, headlinePrice, photoDateLabel } from "@/lib/roomsetu/trust";
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

/**
 * "Add to squad shortlist" as a menu row. SquadShortlistButton returns null when
 * the person has no squads; observe that so the row disappears with it instead
 * of leaving a blank line in the overflow menu.
 */
function SquadMenuRow({ listingId }: { listingId: string }) {
  const [hasSquads, setHasSquads] = useState(false);
  useEffect(() => {
    let live = true;
    void mySquads()
      .then((rows) => live && setHasSquads(rows.length > 0))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!hasSquads) return null;
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <UsersThree size={20} aria-hidden="true" className="shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <SquadShortlistButton listingId={listingId} />
        </div>
      </div>
    </li>
  );
}

type LoadedRoom = Extract<Awaited<ReturnType<typeof getListing>>, { held: false }>;

function ListingBody({ room }: { room: LoadedRoom }) {
  const { user, isPending } = useCurrentUserState();
  const [photo, setPhoto] = useState(0);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const [category, setCategory] = useState<string>(REPORT_CATEGORIES[0]);
  const [requesting, setRequesting] = useState(false);
  const navigate = useNavigate();

  /** The one CTA: send the request (existing action, same notifications), then open the chat with the owner. */
  function requestBed() {
    if (!user) {
      sessionStorage.setItem("roomsetu-next", `/listing/${room.id}`);
      window.location.href = "/login";
      return;
    }
    if (requesting) return;
    setRequesting(true);
    setError("");
    setMessage("");
    void (async () => {
      try {
        await applyToListing({ data: { id: room.id, note: "" } });
      } catch (e) {
        const msg = errText(e);
        if (!isAlreadyRequested(msg)) {
          setError(msg);
          setRequesting(false);
          return;
        }
      }
      try {
        const convo = await openConversation({ data: { listingId: room.id, roomWantedId: "", withUserId: "" } });
        await navigate({ to: "/messages", search: { thread: convo.id } });
      } catch (e) {
        setMessage(requestSentLine(errText(e)));
        setRequesting(false);
      }
    })();
  }

  useEffect(() => {
    if (!user) return;
    void savedIds()
      .then((ids) => setSaved(ids.includes(room.id)))
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
        <div className="min-w-0 lg:col-span-7">
          <div className="relative overflow-hidden rounded-3xl border border-line bg-brand-soft">
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
            {/* Save / Share / ⋯ sit on the photo so the action column stays calm. */}
            <div className="absolute right-3 top-3 flex gap-2">
              <button
                type="button"
                aria-label={saved ? "Saved. Tap to remove" : "Save this bed"}
                aria-pressed={saved}
                data-testid="save-icon"
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-sm backdrop-blur ${saved ? "border-brand bg-brand text-card" : "border-line bg-card/90 text-ink"}`}
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
                    saved ? "Removed from saved" : "Saved 💾",
                  );
                }}
              >
                <BookmarkSimple size={20} weight={saved ? "fill" : "regular"} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Share this bed"
                data-testid="share-icon"
                onClick={() => setShareOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card/90 text-ink shadow-sm backdrop-blur"
              >
                <ShareNetwork size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="More options"
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                data-testid="listing-menu"
                onClick={() => setMenuOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card/90 text-ink shadow-sm backdrop-blur"
              >
                <DotsThree size={24} weight="bold" aria-hidden="true" />
              </button>
            </div>
            {room.images.length > 1 ? (
              <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-semibold text-card tabular-nums">
                {photo + 1} / {room.images.length}
              </span>
            ) : null}
          </div>
          {img && photoDateLabel(img.uploadedAt) ? (
            <p className="mt-2 text-xs text-muted" data-testid="photo-date">
              {photoDateLabel(img.uploadedAt)}
            </p>
          ) : null}
          {room.trust.videoTourUrl ? (
            <a href={room.trust.videoTourUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand underline-offset-4 hover:underline" data-testid="video-tour-link">
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
        <div className="min-w-0 lg:col-span-5">
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
          <h1 className="mt-3 font-display text-3xl leading-tight break-words [text-wrap:balance] md:text-4xl">{room.title}</h1>
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
              Rent and deposit are paid directly to the owner. Roomeo never holds your deposit and takes no cut.
            </p>
            <p className="mt-2 text-sm font-semibold" data-testid="deposit-terms">
              {depositTerms(room.deposit)}
            </p>
          </div>
          <p className="mt-3 text-sm font-medium [text-wrap:pretty]" data-testid="fee-line">
            {FEE_UNDER_PRICE}.{" "}
            <Link to="/pricing" className="font-semibold text-brand">How pricing works</Link>
          </p>
          <div id="contact" className="mt-4 flex scroll-mt-24 flex-col gap-2">
            <button
              type="button"
              disabled={requesting}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand text-base font-semibold text-card transition-transform active:scale-[0.98] disabled:opacity-60"
              data-testid="request-bed"
              onClick={requestBed}
            >
              <ChatCircleDots size={22} aria-hidden="true" />
              {requesting ? "Sending your request…" : user ? REQUEST_CTA : REQUEST_CTA_SIGNED_OUT}
            </button>
            <p className="text-center text-xs text-muted">Free to request. Opens a chat with the owner right away 💬</p>
            {user ? <ContactGate listingId={room.id} isDemo={room.isDemo} hideOpen /> : null}
            <button
              type="button"
              onClick={() => setTrialOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-brand underline-offset-4 hover:underline"
              data-testid="trial-link"
            >
              <Ticket size={16} aria-hidden="true" /> Not sure yet? Book a trial night · ₹99
            </button>
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
              No visit. You judge this bed from the photos and the rent.
            </p>
          </div>
          <div data-testid="location-box">
            <h2 className="text-2xl font-semibold">Where it is</h2>
            {room.exactLocation ? (
              <div className="mt-2 rounded-2xl border border-line bg-card p-4" data-testid="location-unlocked">
                <p className="text-sm font-semibold">📍 {room.exactLocation.address}{room.exactLocation.address.includes(room.exactLocation.pincode) ? "" : `, ${room.exactLocation.pincode}`}</p>
                {room.exactLocation.mapsUrl ? (
                  <a
                    href={room.exactLocation.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex h-12 items-center rounded-full bg-brand px-4 text-sm font-semibold text-card"
                  >
                    Open in Google Maps
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 rounded-2xl border border-dashed border-line bg-card p-4" data-testid="location-locked">
                <p className="text-sm font-semibold">
                  {room.locality}, {room.city}
                </p>
                <p className="mt-1 text-sm text-muted">{LOCKED_LOCATION_LINE}</p>
                {room.locationLock && (room.locationLock.signed || room.locationLock.paid) ? (
                  <p className="mt-2 text-xs text-muted">
                    {room.locationLock.signed ? "Agreement signed ✅" : "Agreement not signed yet"} ·{" "}
                    {room.locationLock.paid ? "Fee paid ✅" : "Fee not confirmed yet"}
                  </p>
                ) : null}
              </div>
            )}
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
      {/* Secondary actions live here so the page has one clear CTA. */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="More options" testId="listing-menu-sheet" labelledBy="listing-menu-title">
        <ul className="min-w-0 divide-y divide-line">
          <li>
            <button
              type="button"
              data-testid="menu-trial"
              className="flex w-full min-w-0 items-center gap-3 py-3 text-left"
              onClick={() => {
                setMenuOpen(false);
                setTrialOpen(true);
              }}
            >
              <Ticket size={20} aria-hidden="true" className="shrink-0 text-brand" />
              <span className="min-w-0">
                <span className="block font-semibold">Book a trial night · ₹99</span>
                <span className="block text-xs text-muted">Stay 1–3 nights before you commit.</span>
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              data-testid="menu-share"
              className="flex w-full min-w-0 items-center gap-3 py-3 text-left"
              onClick={() => {
                setMenuOpen(false);
                setShareOpen(true);
              }}
            >
              <ShareNetwork size={20} aria-hidden="true" className="shrink-0 text-brand" />
              <span className="min-w-0">
                <span className="block font-semibold">Share this bed</span>
                <span className="block text-xs text-muted">WhatsApp, or copy the link.</span>
              </span>
            </button>
          </li>
          {room.trust.videoTourUrl ? (
            <li>
              <a
                href={room.trust.videoTourUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                data-testid="menu-video-tour"
                className="flex w-full min-w-0 items-center gap-3 py-3 text-left"
              >
                <ArrowSquareOut size={20} aria-hidden="true" className="shrink-0 text-brand" />
                <span className="min-w-0">
                  <span className="block font-semibold">Watch the video tour</span>
                  <span className="block text-xs text-muted">Opens on the owner&apos;s link.</span>
                </span>
              </a>
            </li>
          ) : null}
          {user ? (
            // The squad button renders nothing when the person has no squads, so the
            // row itself is hidden then too (no empty menu line).
            <SquadMenuRow listingId={room.id} />
          ) : null}
          <li>
            <button
              type="button"
              data-testid="menu-report"
              className="flex w-full min-w-0 items-center gap-3 py-3 text-left text-danger"
              onClick={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
            >
              <Flag size={20} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0">
                <span className="block font-semibold">Report this listing</span>
                <span className="block text-xs text-muted">Something off? Tell us.</span>
              </span>
            </button>
          </li>
          <li>
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
              data-testid="menu-more-rooms"
              className="flex w-full min-w-0 items-center gap-3 py-3 text-left"
            >
              <CalendarBlank size={20} aria-hidden="true" className="shrink-0 text-brand" />
              <span className="min-w-0">
                <span className="block font-semibold">More rooms in {room.city}</span>
                <span className="block text-xs text-muted">Same area, other beds.</span>
              </span>
            </Link>
          </li>
        </ul>
      </Sheet>

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Share this bed" testId="share-sheet" labelledBy="share-sheet-title">
        <p className="text-sm text-muted">Send it to the gang. No account needed to open the link.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={whatsappShareUrl(shareText({ title: room.title, locality: room.locality, rent: room.rent, allInInr: room.trust.allInInr }), `${SITE_URL}/listing/${room.id}`)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="share-whatsapp"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#14532d] px-4 text-sm font-semibold text-white"
          >
            WhatsApp
          </a>
          <button
            type="button"
            data-testid="share-more"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold"
            onClick={() =>
              void shareNative({
                title: room.title,
                text: shareText({ title: room.title, locality: room.locality, rent: room.rent, allInInr: room.trust.allInInr }),
                url: `${SITE_URL}/listing/${room.id}`,
              }).then((r) =>
                setShareNote(r === "copied" ? "Link copied. Paste it in your story or DM ✨" : r === "unavailable" ? "Copy the link from the address bar." : ""),
              )
            }
          >
            Instagram / more
          </button>
        </div>
        {shareNote ? <p className="mt-2 text-xs text-muted" role="status">{shareNote}</p> : null}
        <div className="mt-4">
          <ShareButtons room={{ ...room, allInInr: room.trust.allInInr }} url={`${SITE_URL}/listing/${room.id}`} />
        </div>
      </Sheet>

      <Sheet open={trialOpen} onClose={() => setTrialOpen(false)} title="Book a trial night" testId="trial-sheet" labelledBy="trial-sheet-title">
        <TrialNightsSheetBody listingId={room.id} />
      </Sheet>

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title="Report this listing" testId="report-sheet" labelledBy="report-sheet-title">
        <form
          className="space-y-2"
          data-testid="report-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!user && !isPending) {
              sessionStorage.setItem("roomsetu-next", safeNext(`/listing/${room.id}`));
              window.location.href = "/login";
              return;
            }
            void act(
              () => fileReport({ data: { targetType: "LISTING", targetId: room.id, category, note } }),
              "Report filed for review",
            );
            setReportOpen(false);
          }}
        >
          <select
            aria-label="What's wrong"
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
            aria-label="What looks wrong"
          />
          <button className="h-11 w-full rounded-full bg-ink px-4 text-sm font-semibold text-card" type="submit" data-testid="report-submit">
            Send report
          </button>
        </form>
      </Sheet>

      <div className="h-24 md:hidden" aria-hidden="true" />
      <div
        className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-card/95 px-4 py-2 backdrop-blur md:hidden"
        data-testid="sticky-cta"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold tabular-nums">
              {inr(headlinePrice(room.rent, room.trust.allInInr).amount)}
              <span className="text-xs font-medium text-muted"> / month</span>
            </p>
            <p className="truncate text-xs text-muted">{inr(room.deposit)} deposit, paid to the owner</p>
          </div>
          <button
            type="button"
            disabled={requesting}
            data-testid="sticky-request-bed"
            className="h-12 shrink-0 rounded-full bg-brand px-4 text-sm font-semibold text-card transition-transform duration-300 active:scale-[0.98] disabled:opacity-60"
            onClick={requestBed}
          >
            {requesting ? "Sending…" : user ? REQUEST_CTA : REQUEST_CTA_SIGNED_OUT}
          </button>
        </div>
      </div>
    </Shell>
  );
}
