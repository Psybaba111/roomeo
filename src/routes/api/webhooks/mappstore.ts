import { createFileRoute } from "@tanstack/react-router";
import { mappstoreSignatureValid, parseMappstoreEvents } from "@/lib/roomsetu/mappstore";

/**
 * MappStore webhook: delivery statuses + inbound WhatsApp replies. Register https://<site>/api/webhooks/mappstore in MappStore
 * with MAPPSTORE_WEBHOOK_SECRET as the HMAC secret. Verifies X-Mappstore-Signature, then logs status events.
 * TODO: persist statuses (sent/delivered/read/failed) once message ids are stored with notifications.
 */
export const Route = createFileRoute("/api/webhooks/mappstore")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.MAPPSTORE_WEBHOOK_SECRET?.trim() ?? "";
        if (!secret) return new Response("webhook not configured", { status: 503 });
        const raw = await request.text();
        if (!mappstoreSignatureValid(secret, raw, request.headers.get("x-mappstore-signature"))) {
          return new Response("bad signature", { status: 401 });
        }
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        // Log kinds/statuses only, never phone numbers or message bodies.
        for (const e of parseMappstoreEvents(body)) {
          if (e.kind === "status") console.info("[mappstore:webhook] status", e.status);
          else if (e.kind === "inbound") console.info("[mappstore:webhook] inbound", e.optOut ? "opt-out" : "message");
          else console.info("[mappstore:webhook] unknown");
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
