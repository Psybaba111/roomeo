import { pageHead } from "@/lib/seo";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { btnPrimary, btnSecondary, btnDanger, card, inner, linkCls } from "@/components/ui-tokens";
import { RoomieShareCard } from "@/components/roomie-card";
import { cleanAnswers, isComplete, ROOMIE_QUESTIONS, ROOMIE_TYPES, roomieTypeFor, type RoomieAnswers, type RoomieTypeKey } from "@/lib/roomsetu/roomie-quiz";
import { deleteRoomieQuiz, getMyRoomie, getRoomieQuizFlag, saveRoomieQuiz } from "@/lib/roomsetu/roomie-quiz-api";

export const Route = createFileRoute("/roomie-quiz")({
  head: () => pageHead("What's your roomie type?", { description: "A 2-minute quiz: 9 questions, 6 roomie types. Find out who you'd vibe with in a PG or shared flat." }),
  component: RoomieQuizPage,
});

const DRAFT_KEY = "roomeo-roomie-draft";
const EMPTY_SEARCH = { city: "", locality: "", maxRent: "", roomType: "", furnished: "", gender: "", food: "", kind: "", sort: "recommended", q: "", availableBy: "" };

function readDraft(): RoomieAnswers {
  try {
    return cleanAnswers(JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

type Step = { kind: "intro" } | { kind: "q"; i: number } | { kind: "result" };

function RoomieQuizPage() {
  const { user, isPending } = useCurrentUserState();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState<RoomieAnswers>({});
  const [step, setStep] = useState<Step>({ kind: "intro" });
  const [saved, setSaved] = useState<RoomieTypeKey | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void getRoomieQuizFlag()
      .then((f) => setEnabled(f.enabled))
      .catch(() => setEnabled(false));
    const draft = readDraft();
    if (isComplete(draft)) {
      setAnswers(draft);
      setStep({ kind: "result" });
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setSaved(null);
      return;
    }
    void getMyRoomie()
      .then((r) => setSaved(r.saved?.type ?? null))
      .catch(() => undefined);
  }, [user]);

  const result = useMemo<RoomieTypeKey | null>(() => (isComplete(answers) ? roomieTypeFor(answers) : null), [answers]);

  function pick(qi: number, optionId: string | null) {
    const q = ROOMIE_QUESTIONS[qi];
    const next = { ...answers };
    if (optionId) next[q.id] = optionId;
    else delete next[q.id];
    setAnswers(next);
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      /* private mode: fine, answers stay in memory */
    }
    if (qi + 1 < ROOMIE_QUESTIONS.length) setStep({ kind: "q", i: qi + 1 });
    else setStep({ kind: "result" });
  }

  function restart() {
    setAnswers({});
    setConsent(false);
    setNote("");
    setError("");
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setStep({ kind: "q", i: 0 });
  }

  function signInToSave() {
    sessionStorage.setItem("roomsetu-next", "/roomie-quiz");
    window.location.href = "/login";
  }

  async function save() {
    if (!consent || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await saveRoomieQuiz({ data: { answers, consent: true } });
      setSaved(r.type);
      setNote(`Saved! You're officially a ${ROOMIE_TYPES[r.type].name} on Roomeo.`);
      sessionStorage.removeItem(DRAFT_KEY);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    if (!window.confirm("Delete your quiz answers and roomie type? Hosts won't see a type any more.")) return;
    setBusy(true);
    setError("");
    try {
      await deleteRoomieQuiz();
      setSaved(null);
      setNote("Deleted. Your answers and type are gone from Roomeo.");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) {
    return (
      <Shell>
        <p className="animate-pulse text-muted">Loading the quiz…</p>
      </Shell>
    );
  }

  if (!enabled) {
    return (
      <Shell>
        <div className="mx-auto max-w-md" data-testid="roomie-off">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Coming soon</p>
          <h1 className="mt-2 font-display text-4xl">Roomie quiz drops soon 👀</h1>
          <p className="mt-3 text-muted">Meanwhile, the beds are very real.</p>
          <Link to="/search" search={EMPTY_SEARCH} className={`${btnPrimary} mt-6`}>
            Browse beds
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto w-full max-w-md min-w-0" data-testid="roomie-quiz">
        {step.kind === "intro" ? (
          <Intro saved={saved} onStart={() => setStep({ kind: "q", i: 0 })} onDelete={remove} busy={busy} note={note} error={error} />
        ) : null}

        {step.kind === "q" ? (
          <Question i={step.i} answers={answers} onPick={pick} onBack={() => setStep(step.i ? { kind: "q", i: step.i - 1 } : { kind: "intro" })} />
        ) : null}

        {step.kind === "result" && result ? (
          <div data-testid="roomie-result">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Your roomie type</p>
            <h1 className="mt-1 font-display text-4xl">
              {ROOMIE_TYPES[result].emoji} {ROOMIE_TYPES[result].name}
            </h1>
            <p className="mt-1 font-semibold">{ROOMIE_TYPES[result].tagline}</p>
            <p className="mt-3 text-muted">{ROOMIE_TYPES[result].blurb}</p>
            <div className="mt-4 grid gap-2">
              <div className={inner}>
                <p className="text-sm font-bold">💞 Vibes best with</p>
                <p className="text-sm">{ROOMIE_TYPES[result].bestWith.map((k) => `${ROOMIE_TYPES[k].emoji} ${ROOMIE_TYPES[k].name}`).join(" · ")}</p>
              </div>
              <div className={inner}>
                <p className="text-sm font-bold">⚡ Might clash with</p>
                <p className="text-sm">
                  {ROOMIE_TYPES[result].clashesWith.length
                    ? ROOMIE_TYPES[result].clashesWith.map((k) => `${ROOMIE_TYPES[k].emoji} ${ROOMIE_TYPES[k].name}`).join(" · ")
                    : "Honestly? No one. You're the easy one 😌"}
                </p>
                <p className="mt-1 text-xs text-muted">{ROOMIE_TYPES[result].clashTip}</p>
              </div>
            </div>

            <section className={`${card} mt-5`} data-testid="roomie-save">
              {saved === result && note ? (
                <p className="text-sm font-semibold" role="status">
                  {note}
                </p>
              ) : user ? (
                <>
                  <p className="font-semibold">Save it to your profile?</p>
                  <p className="mt-1 text-sm text-muted">Unlocks your Vibe match % on beds that already have roomies. Totally optional: search and booking work the same either way.</p>
                  <label className="mt-3 flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 shrink-0"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      data-testid="roomie-consent"
                    />
                    <span>
                      Save my answers and roomie type to my Roomeo profile. Hosts I send a request to see my{" "}
                      <b>type and Vibe match % only</b>, never my answers. Listings I live in show my type in a count, no name. I can delete it anytime.
                    </span>
                  </label>
                  <button type="button" className={`${btnPrimary} mt-3 w-full`} disabled={!consent || busy} onClick={() => void save()} data-testid="roomie-save-btn">
                    {busy ? "Saving…" : saved ? "Update my type" : "Save my type"}
                  </button>
                </>
              ) : (
                <>
                  <p className="font-semibold">Want hosts to see your type?</p>
                  <p className="mt-1 text-sm text-muted">Sign in to save it. Your answers stay private. Totally optional.</p>
                  <button type="button" className={`${btnSecondary} mt-3 w-full`} onClick={signInToSave} disabled={isPending}>
                    Sign in to save
                  </button>
                </>
              )}
              {error ? (
                <p className="mt-2 text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
            </section>

            <h2 className="mt-8 font-display text-2xl">Flex it on your story 📲</h2>
            <p className="mb-4 mt-1 text-sm text-muted">1080×1920, made for Instagram Stories.</p>
            <RoomieShareCard type={result} />

            <div className="mt-8 grid grid-cols-2 gap-2">
              <Link to="/search" search={EMPTY_SEARCH} className={btnPrimary}>
                Find beds
              </Link>
              <button type="button" className={btnSecondary} onClick={restart}>
                Retake
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

function Intro({ saved, onStart, onDelete, busy, note, error }: { saved: RoomieTypeKey | null; onStart: () => void; onDelete: () => void; busy: boolean; note: string; error: string }) {
  return (
    <div data-testid="roomie-intro">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Roomie quiz · 2 mins</p>
      <h1 className="mt-2 font-display text-4xl leading-tight">What kind of roomie are you, fr? 🛏️</h1>
      <p className="mt-3 text-muted">9 quick questions (+1 optional) on sleep, mess, smoking, food, guests and noise. Get one of 6 roomie types, a Vibe match % on beds with roomies, and a card to flex.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {Object.values(ROOMIE_TYPES).map((t) => (
          <span key={t.key} className="rounded-full px-3 py-1 text-sm font-semibold" style={{ background: t.colors.bg, color: t.colors.ink }}>
            {t.emoji} {t.name}
          </span>
        ))}
      </div>
      {saved ? (
        <div className={`${card} mt-5`} data-testid="roomie-saved">
          <p className="text-sm text-muted">Your saved type</p>
          <p className="font-display text-2xl">
            {ROOMIE_TYPES[saved].emoji} {ROOMIE_TYPES[saved].name}
          </p>
          <button type="button" className={`${btnDanger} mt-3`} disabled={busy} onClick={onDelete} data-testid="roomie-delete">
            Delete my answers & type
          </button>
        </div>
      ) : null}
      {note ? (
        <p className="mt-3 text-sm font-semibold" role="status">
          {note}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <button type="button" className={`${btnPrimary} mt-6 w-full`} onClick={onStart} data-testid="roomie-start">
        {saved ? "Retake the quiz" : "Let's go →"}
      </button>
      <p className="mt-3 text-center text-sm">
        <Link to="/search" search={EMPTY_SEARCH} className={linkCls}>
          Skip, just show me beds
        </Link>
      </p>
      <p className="mt-6 text-xs text-muted">Optional and private. Nothing is saved unless you say so. Others only ever see your type, never your answers.</p>
    </div>
  );
}

function Question({ i, answers, onPick, onBack }: { i: number; answers: RoomieAnswers; onPick: (i: number, id: string | null) => void; onBack: () => void }) {
  const q = ROOMIE_QUESTIONS[i];
  const pct = Math.round((i / ROOMIE_QUESTIONS.length) * 100);
  return (
    <div data-testid="roomie-question">
      <div className="flex items-center justify-between text-sm text-muted">
        <button type="button" className="font-semibold underline-offset-4 hover:underline" onClick={onBack}>
          ← Back
        </button>
        <span>
          {i + 1} / {ROOMIE_QUESTIONS.length}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-brand">{q.topic}</p>
      <h2 className="mt-1 font-display text-3xl leading-tight">{q.prompt}</h2>
      <div className="mt-5 grid gap-3">
        {q.options.map((o) => {
          const on = answers[q.id] === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onPick(i, o.id)}
              className={`min-h-14 w-full rounded-2xl border-2 px-4 py-3 text-left text-base font-semibold transition active:scale-[0.98] ${on ? "border-brand bg-brand-soft" : "border-line bg-card hover:border-brand"}`}
              aria-pressed={on}
              data-testid="roomie-option"
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {q.optional ? (
        <button type="button" className="mt-4 w-full text-center text-sm font-semibold text-muted underline-offset-4 hover:underline" onClick={() => onPick(i, null)} data-testid="roomie-skip">
          Skip this one →
        </button>
      ) : null}
    </div>
  );
}
