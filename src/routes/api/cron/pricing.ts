import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { runPricingSweep } from "@/lib/roomsetu/pricing-db";

/**
 * Daily pricing sweep, called by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`. Marks unanswered contacts, gives free contacts back,
 * and moves passes covered by the refund promise to REFUND_DUE for the admin refunds list.
 */
export const Route = createFileRoute("/api/cron/pricing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET?.trim() ?? "";
        if (!secret) return new Response("cron not configured", { status: 503 });
        if (request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
        const result = await runPricingSweep(await getSql());
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
