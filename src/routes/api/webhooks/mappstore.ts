import { createFileRoute } from "@tanstack/react-router";
import { mappstoreSignatureValid } from "@/lib/roomsetu/mappstore";

/**
 * MappStore delivery-status webhook (stub). Register https://<site>/api/webhooks/mappstore in MappStore
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
        let event: Record<string, unknown> = {};
        try {
          event = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return new Response("bad json", { status: 400 });
        }
        // Log the type and status only, never phone numbers or message bodies.
        console.info("[mappstore:webhook]", String(event.type ?? event.event ?? "unknown"), String(event.status ?? ""));
        return new Response("ok", { status: 200 });
      },
    },
  },
});
