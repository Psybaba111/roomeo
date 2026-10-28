import { Link } from "@tanstack/react-router";

/** Friendly empty state when an area has few or no beds yet. */
export function EmptyBeds({ area, compact = false }: { area?: string; compact?: boolean }) {
  return (
    <div
      className={`rounded-3xl border border-dashed border-line bg-card text-center ${compact ? "p-5" : "p-8"}`}
      data-testid="empty-beds"
    >
      <p className="text-3xl" aria-hidden="true">
        🛏️
      </p>
      <p className="mt-2 text-xl font-semibold">
        No beds yet in {area || "this area"} — list yours
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        roomeo just launched. Got a spare bed? Be the first host here. Looking? Post what you need
        and hosts can find you.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link
          to="/create-listing"
          className="inline-flex h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-card"
        >
          List your bed
        </Link>
        <Link
          to="/create-room-wanted"
          className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold"
        >
          Post what you need
        </Link>
      </div>
    </div>
  );
}
