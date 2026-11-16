import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { errText } from "@/lib/ui-text";
import { ROOMIE_TYPES } from "@/lib/roomsetu/roomie-quiz";
import { deleteRoomieQuiz, getListingRoomies, getMyRoomie } from "@/lib/roomsetu/roomie-quiz-api";
import { btnDanger, btnSmallPrimary, card, linkCls } from "@/components/ui-tokens";
import type { RoomieTypeKey } from "@/lib/roomsetu/roomie-quiz";
import { VibeMatchBadge } from "@/components/roomie-card";

/** Profile card: your type (or a nudge to take the quiz), with delete. Hidden while the flag is off. */
export function RoomieProfileCard() {
  const [state, setState] = useState<{ enabled: boolean; type: RoomieTypeKey | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void getMyRoomie()
      .then((r) => setState({ enabled: r.enabled, type: r.saved?.type ?? null }))
      .catch(() => setState(null));
  }, []);

  if (!state || (!state.enabled && !state.type)) return null;
  const t = state.type ? ROOMIE_TYPES[state.type] : null;

  async function remove() {
    if (busy || !window.confirm("Delete your quiz answers and roomie type?")) return;
    setBusy(true);
    try {
      await deleteRoomieQuiz();
      setState((s) => (s ? { ...s, type: null } : s));
      setMsg("Deleted. Your answers and type are gone.");
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${card} mt-4`} data-testid="profile-roomie">
      {t ? (
        <>
          <p className="text-sm text-muted">Your roomie type</p>
          <p className="font-display text-2xl">
            {t.emoji} {t.name}
          </p>
          <p className="text-sm">{t.tagline}</p>
          <p className="mt-2 text-xs text-muted">Hosts you request see your type and Vibe match % only, never your answers.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/roomie-quiz" className={btnSmallPrimary}>
              Retake / share card
            </Link>
            <button type="button" className={btnDanger} disabled={busy} onClick={() => void remove()} data-testid="profile-roomie-delete">
              Delete answers & type
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-semibold">What kind of roomie are you? 🛏️</p>
          <p className="text-sm text-muted">2-min quiz, totally optional. Unlocks a Vibe match % on beds with roomies. Hosts see your type, never your answers.</p>
          <Link to="/roomie-quiz" className={`${btnSmallPrimary} mt-3`} data-testid="profile-roomie-cta">
            Take the roomie quiz
          </Link>
        </>
      )}
      {msg ? (
        <p className="mt-2 text-sm" role="status">
          {msg}
        </p>
      ) : null}
    </section>
  );
}

/** Listing: who lives here, by type only ("2 Moonlighters, 1 Sunrise Sipper"). Never blocks the page. */
export function RoomieOccupants({ listingId }: { listingId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getListingRoomies>> | null>(null);
  useEffect(() => {
    let live = true;
    void getListingRoomies({ data: { listingId } })
      .then((d) => live && setData(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [listingId]);
  if (!data?.enabled) return null;
  return (
    <div className="rounded-2xl border border-line bg-card p-4" data-testid="listing-roomies">
      <h2 className="text-lg font-semibold">Who's living here 🏠</h2>
      {data.total ? (
        <>
          <p className="mt-1 text-sm" data-testid="listing-roomies-summary">
            {data.summary}
          </p>
          {data.match ? (
            <div className="mt-3" data-testid="listing-vibe-match">
              <VibeMatchBadge score={data.match.score} ruleOut={data.match.ruleOut} />
              {data.match.why.length ? (
                <>
                  <p className="mt-3 text-sm font-bold">Why you'll click</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {data.match.why.map((l) => (
                      <li key={l}>✅ {l}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {data.match.headsUp.length ? (
                <>
                  <p className="mt-3 text-sm font-bold">Heads-up</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {data.match.headsUp.map((l) => (
                      <li key={l}>⚠️ {l}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">No roomie types yet from people living here.</p>
      )}
      <p className="mt-2 text-xs text-muted">
        Types and a match score only. No names, no answers.{" "}
        <Link to="/roomie-quiz" className={linkCls}>
          What's yours?
        </Link>
      </p>
    </div>
  );
}
