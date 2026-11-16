import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { RoomieQuestion } from "@/components/roomie-question";
import { isComplete, ROOMIE_QUESTIONS, ROOMIE_TYPES, roomieTypeFor, type RoomieAnswers, type RoomieTypeKey } from "@/lib/roomsetu/roomie-quiz";
import { readRoomieDraft, vibeSearch, writeRoomieDraft } from "@/lib/roomsetu/roomie-draft";
import { trackQuiz } from "@/lib/roomsetu/track-quiz";

const BEDS_SEARCH = (city: string) => ({ ...vibeSearch(city), sort: "recommended" });
const CONFETTI = Array.from({ length: 18 }, (_, i) => ["#c6f432", "#ff6aa9", "#ffcf5c", "#7ad7ff", "#ffffff"][i % 5]);

type Phase = { kind: "intro" } | { kind: "q"; i: number } | { kind: "won"; type: RoomieTypeKey };

/**
 * Homepage hero when ROOMIE_QUIZ_ENABLED is on: the roomie quiz as a 2-minute game, played inline.
 * Works signed out (answers stay in this tab); sign-in + consent are only asked on /roomie-quiz to save.
 * "Just show me beds" is always on screen, so the quiz never stands between anyone and search.
 */
export function QuizHero({ city }: { city: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [answers, setAnswers] = useState<RoomieAnswers>({});

  useEffect(() => {
    const draft = readRoomieDraft();
    if (isComplete(draft)) {
      setAnswers(draft);
      setPhase({ kind: "won", type: roomieTypeFor(draft) });
    }
  }, []);

  function start() {
    trackQuiz("quiz_start", "home", city);
    setAnswers({});
    writeRoomieDraft({});
    setPhase({ kind: "q", i: 0 });
  }

  function pick(qi: number, optionId: string | null) {
    const q = ROOMIE_QUESTIONS[qi];
    const next = { ...answers };
    if (optionId) next[q.id] = optionId;
    else delete next[q.id];
    setAnswers(next);
    writeRoomieDraft(next);
    if (qi + 1 < ROOMIE_QUESTIONS.length) setPhase({ kind: "q", i: qi + 1 });
    else if (isComplete(next)) {
      trackQuiz("quiz_complete", "home", city);
      setPhase({ kind: "won", type: roomieTypeFor(next) });
    } else setPhase({ kind: "q", i: ROOMIE_QUESTIONS.findIndex((x) => !x.optional && !next[x.id]) });
  }

  const skip = (
    <Link
      to="/search"
      search={BEDS_SEARCH(city)}
      onClick={() => trackQuiz("quiz_skip", "home", city)}
      className="inline-flex min-h-11 items-center gap-1 rounded-full px-1 text-base font-semibold text-white underline decoration-lime decoration-2 underline-offset-4 hover:text-lime"
      data-testid="hero-skip"
    >
      Just show me beds →
    </Link>
  );

  return (
    <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[#2a0a4a] px-4 pb-12 pt-8 text-white" data-testid="quiz-hero">
      <div className="relative mx-auto max-w-xl">
        {phase.kind === "intro" ? (
          <div data-testid="quiz-hero-intro">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              <span aria-hidden>🎮</span> 2-min game · no sign-up{city ? ` · ${city}` : ""}
            </p>
            <h1 className="mt-4 text-[2.6rem] font-bold leading-[1.02] tracking-tight sm:text-6xl">
              What's your
              <br />
              <span className="text-lime">roomie type?</span>
            </h1>
            <p className="mt-3 max-w-md text-base text-white/85">
              9 quick taps. Unlock one of 6 types, see beds you'd vibe in, and get a card to flex.
            </p>
            <div className="mt-4 flex flex-wrap gap-2" aria-label="The six roomie types">
              {Object.values(ROOMIE_TYPES).map((t) => (
                <span key={t.key} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: t.colors.bg, color: t.colors.ink, border: `1px solid ${t.colors.accent}` }}>
                  {t.emoji} {t.name}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={start}
              className="mt-6 flex min-h-14 w-full items-center justify-center rounded-full bg-lime px-6 text-lg font-bold text-[#14111f] shadow-[0_6px_0_#7ea300] transition active:translate-y-1 active:shadow-[0_2px_0_#7ea300] motion-reduce:transition-none sm:w-auto"
              data-testid="hero-play"
            >
              Play · Q1 of 9 →
            </button>
            <div className="mt-3">{skip}</div>
            <p className="mt-4 text-xs text-white/70">Nothing's saved unless you choose to. Others only ever see a type, never your answers.</p>
          </div>
        ) : null}

        {phase.kind === "q" ? (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">Find your roomie type 🎮</p>
            <div className="mt-3 rounded-3xl bg-card p-5 text-ink shadow-xl">
              <RoomieQuestion i={phase.i} answers={answers} onPick={pick} onBack={() => setPhase(phase.i ? { kind: "q", i: phase.i - 1 } : { kind: "intro" })} />
            </div>
            <div className="mt-3 text-center">{skip}</div>
          </div>
        ) : null}

        {phase.kind === "won" ? <Won type={phase.type} city={city} onReplay={start} skip={skip} /> : null}
      </div>
    </section>
  );
}

function Won({ type, city, onReplay, skip }: { type: RoomieTypeKey; city: string; onReplay: () => void; skip: ReactNode }) {
  const t = ROOMIE_TYPES[type];
  return (
    <div className="relative" data-testid="quiz-hero-won">
      <div className="pointer-events-none absolute inset-x-0 -top-6 z-20 h-72 overflow-hidden motion-reduce:hidden" aria-hidden>
        {CONFETTI.map((c, i) => (
          <span key={i} className="roomie-confetti absolute top-0 h-4 w-2.5 rounded-sm" style={{ left: `${3 + i * 5.4}%`, background: c, animationDelay: `${(i % 6) * 60}ms`, animationDuration: `${1000 + (i % 4) * 180}ms` }} />
        ))}
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">🏆 Unlocked · 9 of 9</p>
      <div className="roomie-pop mt-3 rounded-3xl p-5 shadow-xl" style={{ background: t.colors.bg, color: t.colors.ink, border: `2px solid ${t.colors.accent}` }}>
        <p className="text-5xl" aria-hidden>
          {t.emoji}
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight">You're a {t.name}</h1>
        <p className="mt-1 font-semibold" style={{ color: t.colors.accent }}>
          {t.tagline}
        </p>
        <p className="mt-2 text-sm opacity-90">{t.blurb}</p>
      </div>
      <Link
        to="/search"
        search={vibeSearch(city)}
        onClick={() => trackQuiz("result_to_search", "home", city)}
        className="mt-5 flex min-h-14 w-full items-center justify-center rounded-full bg-lime px-6 text-lg font-bold text-[#14111f] shadow-[0_6px_0_#7ea300] transition active:translate-y-1 motion-reduce:transition-none"
        data-testid="hero-to-search"
      >
        Beds by Vibe match →
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link to="/roomie-quiz" className="flex min-h-12 items-center justify-center rounded-full bg-white/15 px-4 text-sm font-semibold text-white hover:bg-white/25" data-testid="hero-share-card">
          Story card + save 📲
        </Link>
        <button type="button" onClick={onReplay} className="min-h-12 rounded-full bg-white/15 px-4 text-sm font-semibold text-white hover:bg-white/25">
          Play again
        </button>
      </div>
      <p className="mt-3 text-xs text-white/70">Vibe match needs your type saved (sign in, 1 tap). Until then you'll see all beds.</p>
      <div className="mt-2">{skip}</div>
    </div>
  );
}
