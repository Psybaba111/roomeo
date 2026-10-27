import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";
import { genderLabel, inr, type ListingCard } from "@/lib/roomsetu/map";

export function RoomCard({ room, score }: { room: ListingCard; score?: number }) {
  const [photoOk, setPhotoOk] = useState(true);
  return (
    <Link to="/listing/$id" params={{ id: room.id }} className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-card">
      <div className="relative aspect-[4/3] bg-brand-soft">
        {room.photo && photoOk ? (
          <img
            src={room.photo}
            alt=""
            width={720}
            height={540}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={() => setPhotoOk(false)}
          />
        ) : (
          <div className="flex h-full items-end p-4 font-display text-2xl text-brand-deep">{room.locality}</div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {room.verification === "VERIFIED" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-1 text-xs font-semibold text-brand-deep">
              <BadgeCheck className="h-3.5 w-3.5" /> Verified
            </span>
          ) : null}
          {room.isDemo ? (
            <span className="rounded-full bg-marigold-soft px-2 py-1 text-xs font-semibold text-ink">Sample</span>
          ) : null}
        </div>
        {typeof score === "number" ? (
          <span className="absolute bottom-3 right-3 rounded-full bg-ink px-2 py-1 text-xs font-semibold text-card tabular-nums">
            {score}% match
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-xl leading-tight">{room.title}</h3>
          <p className="shrink-0 text-right">
            <span className="block font-display text-xl tabular-nums">{inr(room.rent)}</span>
            <span className="text-xs text-muted">/ month</span>
          </p>
        </div>
        <p className="text-sm text-muted">
          {room.locality}, {room.city}
        </p>
        <div className="mt-auto flex flex-wrap gap-2 pt-2 text-xs font-medium text-ink">
          <span className="rounded-full bg-paper px-2 py-1">{room.roomType}</span>
          <span className="rounded-full bg-paper px-2 py-1">{room.furnished}</span>
          {room.genderPref !== "ANY" ? (
            <span className="rounded-full bg-paper px-2 py-1">{genderLabel(room.genderPref)} only</span>
          ) : null}
          {room.food ? <span className="rounded-full bg-paper px-2 py-1">Food</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const control =
  "h-12 w-full rounded-xl border border-line bg-paper px-3 text-ink outline-none focus:border-brand";

export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink">{children}</p>;
}
