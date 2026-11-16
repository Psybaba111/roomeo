import { trackQuizEvent } from "@/lib/roomsetu/roomie-quiz-api";
import type { QuizEvent, QuizEventSource } from "@/lib/roomsetu/quiz-events";

/** Fire-and-forget funnel event on the internal metric_events mechanism. Never blocks or breaks the UI. */
export function trackQuiz(kind: QuizEvent, source: QuizEventSource, city = "") {
  try {
    void trackQuizEvent({ data: { kind, source, city } }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
