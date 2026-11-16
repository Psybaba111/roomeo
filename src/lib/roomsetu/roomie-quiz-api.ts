import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { occupantSummary, roomieQuizEnabled } from "@/lib/roomsetu/roomie-quiz";
import { deleteRoomie, roomieTablesReady, occupantTypeCounts, readMyRoomie, recordStaySignals, saveRoomie, vibeMatchFor, vibeScoresFor, type VibeScores } from "@/lib/roomsetu/roomie-quiz-db";
import { quizEventKind, quizEventSource } from "@/lib/roomsetu/quiz-events";
import { logEvent } from "@/lib/roomsetu/services";

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

const quizOn = () => roomieQuizEnabled(process.env);

/** Public: is the quiz on in this environment? */
export const getRoomieQuizFlag = createServerFn({ method: "GET" }).handler(async () => ({ enabled: quizOn() }));

/** The caller's own saved type + answers (answers never go to anyone else). */
export const getMyRoomie = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const enabled = quizOn();
    // Flag off (Production today): don't touch roomie tables unless migration 0028 exists, so a saved type can
    // still be shown and deleted if the flag is ever switched off later.
    if (!enabled && !(await roomieTablesReady(sql))) return { enabled, saved: null };
    const saved = await readMyRoomie(sql, context.userId);
    return { enabled, saved };
  });

export const saveRoomieQuiz = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    return { answers: asRecord(o.answers), consent: o.consent === true };
  })
  .handler(async ({ context, data }) => {
    if (!quizOn()) throw new Error("The roomie quiz isn't live yet.");
    const sql = await getSql();
    const type = await saveRoomie(sql, context.userId, data.answers, data.consent);
    return { type };
  });

/** Always allowed, even with the flag off: people can always delete their answers and type. */
export const deleteRoomieQuiz = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    if (!(await roomieTablesReady(sql))) return { deleted: false };
    const deleted = await deleteRoomie(sql, context.userId);
    return { deleted };
  });

/** Signed-in viewer if any (same pattern as getListing); anonymous viewers still get the type summary. */
const optionalUser = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("@/lib/auth/client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const token = typeof context.bearerToken === "string" ? context.bearerToken : undefined;
    const user = await getSessionUser(token).catch(() => null);
    return next({ context: { userId: user?.id ?? null } });
  });

/**
 * Public: aggregated types of the people living in a listing now (counts only, no names) and, for a signed-in
 * seeker with a saved quiz, their Vibe match with those occupants (score + generic lines, no answers).
 */
export const getListingRoomies = createServerFn({ method: "POST" })
  .middleware([optionalUser])
  .validator((input: unknown) => {
    const id = asRecord(input).listingId;
    if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id)) throw new Error("Unknown room.");
    return { listingId: id };
  })
  .handler(async ({ data, context }) => {
    if (!quizOn()) return { enabled: false, summary: "", total: 0, match: null };
    const sql = await getSql();
    const counts = await occupantTypeCounts(sql, data.listingId);
    const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
    const match = context.userId && total ? await vibeMatchFor(sql, data.listingId, context.userId) : null;
    // Opportunistic, idempotent success-signal logging (60+ day stays). Never fails the page.
    await recordStaySignals(sql, data.listingId).catch(() => 0);
    return {
      enabled: true,
      summary: occupantSummary(counts),
      total,
      match: match ? { score: match.score, ruleOut: match.ruleOut, why: match.why, headsUp: match.headsUp } : null,
    };
  });

/**
 * Vibe match scores for a page of search results, for the signed-in seeker's saved quiz only.
 * Signed out / no saved quiz / flag off → no scores (the search page explains and keeps its normal order).
 */
export const getVibeScores = createServerFn({ method: "POST" })
  .middleware([optionalUser])
  .validator((input: unknown) => {
    const ids = asRecord(input).listingIds;
    const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && /^[\w-]{1,80}$/.test(x)) : [];
    return { listingIds: [...new Set(list)].slice(0, 48) };
  })
  .handler(async ({ data, context }) => {
    if (!quizOn()) return { enabled: false, signedIn: Boolean(context.userId), hasQuiz: false, scores: {} as VibeScores };
    if (!context.userId) return { enabled: true, signedIn: false, hasQuiz: false, scores: {} as VibeScores };
    const sql = await getSql();
    const out = await vibeScoresFor(sql, data.listingIds, context.userId);
    return { enabled: true, signedIn: true, ...out };
  });

/**
 * Quiz funnel events (quiz_start, quiz_complete, quiz_skip, result_to_search) on the app's existing internal
 * mechanism: a row in metric_events (same table as 'search') + a structured logEvent line in Vercel runtime logs.
 * No third-party analytics. Unknown kinds are ignored; never throws to the UI.
 */
export const trackQuizEvent = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const o = asRecord(input);
    return { kind: quizEventKind(o.kind), source: quizEventSource(o.source), city: typeof o.city === "string" ? o.city.slice(0, 40) : "" };
  })
  .handler(async ({ data }) => {
    if (!data.kind || !quizOn()) return { ok: false };
    try {
      const sql = await getSql();
      await sql.query("insert into metric_events (id, kind, city) values ($1, $2, $3)", [crypto.randomUUID(), data.kind, data.city]);
      logEvent(`roomie.${data.kind}`, { source: data.source });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
