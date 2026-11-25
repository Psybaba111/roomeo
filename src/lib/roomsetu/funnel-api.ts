import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertAdmin } from "@/lib/roomsetu/admin-api";
import { funnelCounts, funnelTables, handoffEventsFor, nudgeCounts } from "@/lib/roomsetu/funnel-db";
import { whatsappNotifyEnabled, NOTIFY_EVENTS } from "@/lib/roomsetu/mappstore";

/**
 * Admin funnel (/admin/funnel): step counts for the last 7 and 30 days. GA4 can't be queried from here (no GA Data
 * API credentials), so the counts come from DB state; the funnel_events log (migration 0034) is shown beside them
 * when it exists. Listing views and WhatsApp taps live in GA4 only.
 */
export const adminFunnel = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const tables = await funnelTables(sql);
    const [week, month, nudgesWeek, nudgesMonth] = await Promise.all([
      funnelCounts(sql, 7, tables),
      funnelCounts(sql, 30, tables),
      nudgeCounts(sql, 7, tables),
      nudgeCounts(sql, 30, tables),
    ]);
    return {
      tables,
      windows: [week, month],
      nudges: { week: nudgesWeek, month: nudgesMonth },
      whatsappOn: whatsappNotifyEnabled(),
      nudgeTemplateSet: Boolean(process.env[NOTIFY_EVENTS.ownerNudge]?.trim()),
    };
  });

/** The signed-in person's own server-logged steps (payment completed, moved in) for their browser to send to GA4 once. */
export const myFunnelHandoff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => handoffEventsFor(await getSql(), context.userId));
