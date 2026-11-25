import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { runOwnerNudges } from "@/lib/roomsetu/funnel-db";

/**
 * Owner nudge pass (requests still pending after 2 hours get at most one WhatsApp reminder). Same auth as the daily
 * pricing cron: `Authorization: Bearer $CRON_SECRET`. The daily Vercel cron (/api/cron/pricing) also runs it; this route
 * exists so an hourly scheduler can call it too. Nothing is sent while MAPPSTORE_NOTIFY_ENABLED is off: due nudges
 * are only logged as HELD. Without migration 0034 it does nothing and says so.
 */
export const Route = createFileRoute("/api/cron/nudges")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET?.trim() ?? "";
        if (!secret) return new Response("cron not configured", { status: 503 });
        if (request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
        const nudges = await runOwnerNudges(await getSql());
        return Response.json({ ok: true, nudges });
      },
    },
  },
});
