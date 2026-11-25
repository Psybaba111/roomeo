import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { runPricingSweep } from "@/lib/roomsetu/pricing-db";
import { runOwnerNudges } from "@/lib/roomsetu/funnel-db";

/**
 * Daily pricing sweep, called by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`. Marks unanswered contacts, gives free contacts back,
 * and moves passes covered by the refund promise to REFUND_DUE for the admin refunds list. Then the owner nudge pass.
 */
export const Route = createFileRoute("/api/cron/pricing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET?.trim() ?? "";
        if (!secret) return new Response("cron not configured", { status: 503 });
        if (request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
        const sql = await getSql();
        const result = await runPricingSweep(sql);
        // Owner nudges ride on the same daily cron (see /api/cron/nudges). A nudge failure never fails the sweep.
        const nudges = await runOwnerNudges(sql).catch((e) => ({ error: String(e).slice(0, 120) }));
        return Response.json({ ok: true, ...result, nudges });
      },
    },
  },
});
