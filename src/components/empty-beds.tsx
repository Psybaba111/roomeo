import { Link } from "@tanstack/react-router";
import { Bed } from "@phosphor-icons/react";
import { btnPrimary, btnSecondary } from "@/components/ui-tokens";

/** Friendly empty state when an area has few or no beds yet. */
export function EmptyBeds({ area, compact = false }: { area?: string; compact?: boolean }) {
  return (
    <div className={`rounded-3xl border border-dashed border-line bg-card text-center ${compact ? "p-4" : "p-8"}`} data-testid="empty-beds">
      <Bed size={40} aria-hidden="true" className="mx-auto text-brand" />
      <p className="mt-2 text-xl font-semibold [text-wrap:balance]">No beds yet in {area || "this area"} — list yours</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        roomeo just launched. Got a spare bed? Be the first host here. Looking? Post what you need and hosts can find you.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link to="/create-listing" className={btnPrimary}>List your bed</Link>
        <Link to="/create-room-wanted" className={btnSecondary}>Post what you need</Link>
      </div>
    </div>
  );
}
