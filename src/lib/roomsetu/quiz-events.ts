/** Quiz funnel events. Stored as metric_events.kind; keep this list closed (no free-form kinds from clients). */
export const QUIZ_EVENTS = ["quiz_start", "quiz_complete", "quiz_skip", "result_to_search"] as const;
export type QuizEvent = (typeof QUIZ_EVENTS)[number];
export const QUIZ_EVENT_SOURCES = ["home", "quiz_page"] as const;
export type QuizEventSource = (typeof QUIZ_EVENT_SOURCES)[number];

export function quizEventKind(v: unknown): QuizEvent | null {
  return typeof v === "string" && (QUIZ_EVENTS as readonly string[]).includes(v) ? (v as QuizEvent) : null;
}

export function quizEventSource(v: unknown): QuizEventSource {
  return typeof v === "string" && (QUIZ_EVENT_SOURCES as readonly string[]).includes(v) ? (v as QuizEventSource) : "quiz_page";
}

/** Keep the listing order, but put scored beds first (best Vibe match first; rule-outs last among scored). */
export function orderByVibe<T extends { id: string }>(listings: T[], scores: Record<string, { score: number; ruleOut: boolean }>): T[] {
  return listings
    .map((l, i) => ({ l, i, s: scores[l.id] }))
    .sort((a, b) => {
      if (a.s && !b.s) return -1;
      if (!a.s && b.s) return 1;
      if (a.s && b.s) {
        if (a.s.ruleOut !== b.s.ruleOut) return a.s.ruleOut ? 1 : -1;
        if (a.s.score !== b.s.score) return b.s.score - a.s.score;
      }
      return a.i - b.i;
    })
    .map((x) => x.l);
}
