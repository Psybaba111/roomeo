import { useEffect, useState } from "react";
import { WhatsappLogo, Copy, Gift } from "@phosphor-icons/react";
import { claimReferral, getMyReferral } from "@/lib/roomsetu/referral-api";
import { whatsappShareUrl } from "@/lib/share";

export const REF_STORAGE_KEY = "roomeo_ref";

type Data = Awaited<ReturnType<typeof getMyReferral>>;

/** "Bring a roommate, both save ₹500". Renders nothing while the flag is off or the tables aren't there yet. */
export function ReferralCard() {
  const [data, setData] = useState<Data | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      // Claim a pending invite picked up from /r/CODE before sign-up.
      const pending = typeof localStorage === "undefined" ? null : localStorage.getItem(REF_STORAGE_KEY);
      if (pending) {
        const r = await claimReferral({ data: { code: pending } }).catch(() => null);
        localStorage.removeItem(REF_STORAGE_KEY);
        if (r && alive) setNote(r.message);
      }
      const d = await getMyReferral().catch(() => null);
      if (alive) setData(d);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!data?.enabled) return note ? <p className="mt-6 text-sm text-muted" role="status">{note}</p> : null;

  return (
    <section className="mt-6 rounded-3xl border-2 border-ink bg-card p-5 shadow-[0_4px_0_var(--color-brand)]" data-testid="referral-card">
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand">
        <Gift className="h-4 w-4" /> Bring a roommate
      </p>
      <h2 className="mt-2 font-display text-3xl">You both save ₹{data.perPerson} 🫶</h2>
      <p className="mt-2 max-w-prose text-muted">
        Send your link to a friend who's hunting. When they move in through roomeo, you each get ₹{data.perPerson} off your first month. No catch, no fees.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          href={whatsappShareUrl(data.shareText, "")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-[#14532d] px-5 font-semibold text-white"
          data-testid="referral-whatsapp"
        >
          <WhatsappLogo className="h-5 w-5" /> Share on WhatsApp
        </a>
        <button
          type="button"
          className="inline-flex h-12 items-center gap-2 rounded-full border border-line bg-card px-5 font-semibold"
          onClick={() => {
            void navigator.clipboard?.writeText(data.link).then(() => setNote("Link copied ✨"));
          }}
        >
          <Copy className="h-5 w-5" /> Copy link
        </button>
        <span className="rounded-full bg-[var(--color-brand)]/10 px-3 py-1 font-mono text-sm font-semibold tracking-widest">{data.code}</span>
      </div>
      <dl className="mt-4 flex flex-wrap gap-6 text-sm">
        <div><dt className="text-muted">Friends joined</dt><dd className="font-display text-2xl tabular-nums">{data.joined}</dd></div>
        <div><dt className="text-muted">Moved in</dt><dd className="font-display text-2xl tabular-nums">{data.movedIn}</dd></div>
        <div><dt className="text-muted">Your credit</dt><dd className="font-display text-2xl tabular-nums">₹{data.creditInr}</dd></div>
      </dl>
      {note ? <p className="mt-3 text-sm text-muted" role="status">{note}</p> : null}
    </section>
  );
}
