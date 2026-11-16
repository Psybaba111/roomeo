import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { occupantSummary, roomieQuizEnabled } from "@/lib/roomsetu/roomie-quiz";
import { deleteRoomie, roomieTablesReady, occupantTypeCounts, readMyRoomie, recordStaySignals, saveRoomie, vibeMatchFor } from "@/lib/roomsetu/roomie-quiz-db";

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
