import { Link } from "@tanstack/react-router";
import { MapPin, ShieldCheck } from "@phosphor-icons/react";
import { BENGALURU_LAUNCH_AREAS } from "@/lib/roomsetu/cities";
import { btnDark, btnSecondary, card } from "@/components/ui-tokens";

/** "1 verified bed" / "3 verified beds". */
function bedsLive(n: number): string {
  return `${n} verified bed${n === 1 ? "" : "s"}`;
}

/**
 * Honest Bengaluru block (25 Nov 2026): we're onboarding owners now. It never claims beds that aren't there; the
 * count is real verified beds (host ID checked, no demo beds), and at zero it says so.
 */
export function BengaluruOnboarding({ live, waitlist }: { live: number; waitlist: boolean }) {
  return (
    <section className="mt-8" aria-labelledby="blr-h" data-testid="blr-onboarding">
      <div className={card}>
        <p className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-deep">
          <MapPin size={16} weight="fill" aria-hidden /> Bengaluru
        </p>
        <h2 id="blr-h" className="mt-2 text-2xl [text-wrap:balance] sm:text-3xl">We&apos;re onboarding owners in Bengaluru now</h2>
        <p className="mt-1 max-w-[680px] text-sm text-muted [text-wrap:pretty]" data-testid="blr-live-line">
          {live > 0
            ? `${bedsLive(live)} live so far. Every bed goes live only after we check the owner's ID.`
            : "No Bengaluru beds are live yet. Each one goes live only after we check the owner's ID, so the first ones will show here soon."}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Areas we're onboarding">
          {BENGALURU_LAUNCH_AREAS.map((a) => (
            <li key={a} className="rounded-full border border-line px-3 py-1 text-sm">{a}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/list-your-bed" className={btnDark} data-testid="blr-list-cta">Own a bed? List it</Link>
          {waitlist ? (
            <a href="#waitlist" className={btnSecondary}>Join the waitlist</a>
          ) : (
            <Link to="/search" search={{ city: "Bengaluru" } as never} className={btnSecondary}>Search Bengaluru</Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** Shown where the real beds strip would be when no verified real beds are live anywhere. */
export function NoVerifiedBeds() {
  return (
    <section className="pt-6" aria-labelledby="no-beds-h" data-testid="no-verified-beds">
      <div className={card}>
        <ShieldCheck size={28} weight="duotone" className="text-brand" aria-hidden />
        <h2 id="no-beds-h" className="mt-2 text-xl font-semibold [text-wrap:balance]">No verified beds are live right now</h2>
        <p className="mt-1 max-w-[680px] text-sm text-muted [text-wrap:pretty]">
          We only show a bed after the owner&apos;s ID is checked, so this stays empty until then. Owners can send a bed for review today.
        </p>
        <Link to="/list-your-bed" className={`mt-4 ${btnDark}`}>List your bed</Link>
      </div>
    </section>
  );
}
