import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { cashfreeConfig } from "@/lib/roomsetu/cashfree";
import { cashfreeSignatureValid, eventKey, parseCashfreeEvent, rentAutopayEnabled, webhookFresh } from "@/lib/roomsetu/rent-autopay";
import { applyCashfreeEvent } from "@/lib/roomsetu/rent-autopay-db";

/**
 * Cashfree Subscriptions webhook (rent AutoPay). Register https://<site>/api/webhooks/cashfree in the Cashfree dashboard.
 * Verifies x-webhook-signature = Base64(HMAC-SHA256(x-webhook-timestamp + rawBody)), rejects stale timestamps,
 * and logs each event once (rent_webhook_events) so retries are no-ops. Does nothing while ROOMEO_RENT_AUTOPAY_ENABLED is off.
 */
export const Route = createFileRoute("/api/webhooks/cashfree")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!rentAutopayEnabled()) return new Response("rent autopay off", { status: 503 });
        const cfg = cashfreeConfig();
        if (!cfg) return new Response("webhook not configured", { status: 503 });
        const raw = await request.text();
        const ts = request.headers.get("x-webhook-timestamp");
        const sig = request.headers.get("x-webhook-signature");
        if (!cashfreeSignatureValid(cfg.webhookSecret, ts, raw, sig)) return new Response("bad signature", { status: 401 });
        if (!webhookFresh(ts, new Date())) return new Response("stale", { status: 401 });
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const ev = parseCashfreeEvent(body);
        const type = String((body as { type?: unknown })?.type ?? "");
        const result = await applyCashfreeEvent(await getSql(), eventKey(type, ts, sig, ev), type, body, ev);
        console.info("[cashfree:webhook]", type, result);
        return Response.json({ ok: true, result });
      },
    },
  },
});
