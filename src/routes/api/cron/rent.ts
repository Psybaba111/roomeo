import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { SITE_URL } from "@/lib/seo";
import { cashfreeClient, cashfreeConfig } from "@/lib/roomsetu/cashfree";
import { rentAutopayEnabled } from "@/lib/roomsetu/rent-autopay";
import { runRentSweep } from "@/lib/roomsetu/rent-autopay-db";

/**
 * Daily rent run (Vercel Cron, 08:30 IST, inside the NPCI pre-10 AM window). Bearer $CRON_SECRET.
 * Pre-debit notice ≥24h before due → raise the charge inside an NPCI window → one retry → UPI link fallback.
 * WhatsApp messages are only queued in rent_outbox. Returns 200 "off" and touches nothing while the flag is off.
 */
export const Route = createFileRoute("/api/cron/rent")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET?.trim() ?? "";
        if (!secret) return new Response("cron not configured", { status: 503 });
        if (request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
        if (!rentAutopayEnabled()) return Response.json({ ok: true, off: true });
        const cfg = cashfreeConfig();
        const result = await runRentSweep(await getSql(), cfg ? cashfreeClient(cfg) : null, new Date(), () => `${SITE_URL}/dashboard#rent`);
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
