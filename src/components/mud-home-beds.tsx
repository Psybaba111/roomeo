import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { SealCheck } from "@phosphor-icons/react";
import { inr, type ListingCard } from "@/lib/roomsetu/map";
import { shortBedTitle } from "@/lib/roomsetu/featured-host";

/**
 * Real beds you can see today: Mud Home's own live listings (photos + monthly price), above the hero/quiz.
 * Mobile first: one card ~80% wide with the next peeking in; a plain grid from sm up.
 * In waitlist mode signed-out visitors can't open listing pages, so the cards point at the waitlist form.
 */
export function MudHomeBeds({ rooms, waitlist }: { rooms: ListingCard[]; waitlist: boolean }) {
  if (rooms.length === 0) return null;
  const from = Math.min(...rooms.map((r) => r.rent));
  return (
    <section className="pt-6" aria-labelledby="real-beds" data-testid="mud-home-beds">
      <p className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-deep">
        <SealCheck size={16} weight="fill" aria-hidden /> Real beds, owner verified
      </p>
      <h2 id="real-beds" className="mt-2 text-2xl [text-wrap:balance] sm:text-3xl">
        Mud Home, Bunder, Mangaluru
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted [text-wrap:pretty]">
        AC beds for working men on MPT Road. Rent + bills in one monthly price, from {inr(from)}. Deposit paid straight to the owner.
      </p>
      <ul className="-mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {rooms.map((room) => (
          <li key={room.id} className="w-[80%] shrink-0 snap-start sm:w-auto" data-testid="mud-home-bed">
            <BedTile room={room} waitlist={waitlist} />
          </li>
        ))}
      </ul>
      {waitlist ? (
        <a href="#waitlist" className="mt-2 inline-flex h-12 items-center rounded-full bg-ink px-5 text-base font-semibold text-card transition duration-300 hover:opacity-90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" data-testid="mud-home-waitlist">
          Join the waitlist to request a bed
        </a>
      ) : null}
    </section>
  );
}

function BedTile({ room, waitlist }: { room: ListingCard; waitlist: boolean }) {
  const [photoOk, setPhotoOk] = useState(true);
  const name = shortBedTitle(room.title);
  const body = (
    <>
      <div className="aspect-[4/3] overflow-hidden rounded-xl bg-brand-soft">
        {room.photo && photoOk ? (
          <img src={room.photo} alt={`${name} at Mud Home`} width={720} height={540} loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setPhotoOk(false)} />
        ) : (
          <div className="flex h-full items-end p-4 font-display text-xl text-brand-deep">{room.locality}</div>
        )}
      </div>
      <div className="flex items-start justify-between gap-3 px-1 pb-1 pt-3">
        <p className="font-semibold leading-tight [text-wrap:pretty]">{name}</p>
        <p className="shrink-0 text-right">
          <span className="block font-display text-lg tabular-nums" data-testid="mud-home-price">{inr(room.rent)}</span>
          <span className="text-xs text-muted">/ month</span>
        </p>
      </div>
    </>
  );
  const cls = "block h-full rounded-2xl border border-line bg-card p-2 transition duration-300 hover:shadow-md active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
  return waitlist ? (
    <a href="#waitlist" className={cls} aria-label={`${name}, ${inr(room.rent)} a month. Join the waitlist to request it`}>{body}</a>
  ) : (
    <Link to="/listing/$id" params={{ id: room.id }} className={cls}>{body}</Link>
  );
}
