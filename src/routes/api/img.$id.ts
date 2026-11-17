import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { decodeDataUrl, IMAGE_CACHE, isImageId } from "@/lib/roomsetu/listing-image";

// Only photos of publicly visible listings (same rule as search cards): ACTIVE, owner ACTIVE, demo or ID-verified host.
const VISIBLE_SQL = `select i.url from listing_images i join listings l on l.id = i.listing_id join profiles pr on pr.user_id = l.owner_id
  where i.id = $1 and l.status = 'ACTIVE' and pr.account_status = 'ACTIVE' and (l.is_demo = true or pr.is_demo = true or pr.identity_status = 'VERIFIED')`;

export const Route = createFileRoute("/api/img/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = String(params.id);
        if (!isImageId(id)) return new Response("Not found", { status: 404 });
        try {
          const sql = await getSql();
          const rows = await sql.query<{ url: string }>(VISIBLE_SQL, [id]);
          const img = rows[0] ? decodeDataUrl(String(rows[0].url)) : null;
          if (!img) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
          return new Response(img.bytes as BodyInit, { headers: { "content-type": img.type, "cache-control": IMAGE_CACHE, "x-content-type-options": "nosniff" } });
        } catch (err) {
          console.error("[img] load failed", String(err).slice(0, 200));
          return new Response("Unavailable", { status: 503, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
