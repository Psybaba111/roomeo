import { ROOMIE_QUESTIONS, type RoomieAnswers } from "@/lib/roomsetu/roomie-quiz";

/** One quiz question with progress ("Q1 of 9"), shared by /roomie-quiz and the homepage game hero. */
export function RoomieQuestion({ i, answers, onPick, onBack }: { i: number; answers: RoomieAnswers; onPick: (i: number, id: string | null) => void; onBack: () => void }) {
  const q = ROOMIE_QUESTIONS[i];
  const required = ROOMIE_QUESTIONS.filter((x) => !x.optional).length;
  const pct = Math.round((i / ROOMIE_QUESTIONS.length) * 100);
  return (
    <div data-testid="roomie-question">
      <div className="flex items-center justify-between text-sm text-muted">
        <button type="button" className="font-semibold underline-offset-4 hover:underline" onClick={onBack}>
          ← Back
        </button>
        <span className="font-semibold" data-testid="roomie-progress">
          {q.optional ? "Bonus round ✨" : `Q${i + 1} of ${required}`}
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
