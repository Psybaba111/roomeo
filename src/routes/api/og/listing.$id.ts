import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ogCardModel } from "@/lib/og/listing-card";
import { renderOgCard } from "@/lib/og/listing-card.server";

const ID = /^[0-9A-Za-z_-]{6,80}$/;

/** Generic brand card when the bed is missing, held or the DB hiccups. Never leaks hidden listings. */
const BRAND_CARD = { headline: "Find your bed. No broker's month.", priceLabel: "₹0 fees", priceNote: "free for renters + owners", area: "Mangaluru · Bengaluru", verified: false, photo: null };

async function loadModel(id: string) {
  if (!ID.test(id)) return BRAND_CARD;
  const sql = await getSql();
  // to_jsonb keeps this working before migration 0016 (all_in_inr) lands on a database.
  const rows = await sql.query<Record<string, unknown>>(
    `select l.title, l.description, l.room_type, l.city_name, l.locality_name, l.monthly_rent, l.is_demo, l.status,
            to_jsonb(l) ->> 'all_in_inr' as all_in_inr,
            pr.identity_status, pr.phone_verified_at, pr.is_demo as host_demo, pr.account_status,
            (select i.url from listing_images i where i.listing_id = l.id order by i.sort_order limit 1) as photo
       from listings l join profiles pr on pr.user_id = l.owner_id
      where l.id = $1 and l.status = 'ACTIVE'`,
    [id],
  );
  const r = rows[0];
  if (!r) return BRAND_CARD;
  const verifiedId = String(r.identity_status ?? "") === "VERIFIED";
  if (!(r.is_demo === true || r.host_demo === true || verifiedId)) return BRAND_CARD;
  return ogCardModel({
    title: String(r.title ?? ""),
    roomType: String(r.room_type ?? ""),
    locality: String(r.locality_name ?? ""),
    city: String(r.city_name ?? ""),
    rent: Number(r.monthly_rent ?? 0),
    allInInr: r.all_in_inr == null ? null : Number(r.all_in_inr),
    verified: verifiedId && Boolean(r.phone_verified_at),
    photo: r.photo == null ? null : String(r.photo),
    description: String(r.description ?? ""),
  });
}

export const Route = createFileRoute("/api/og/listing/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = String(params.id).replace(/\.(jpg|jpeg|png)$/i, "");
        let model;
        try {
          model = await loadModel(id);
        } catch (err) {
          console.error("[og] listing load failed", err);
          model = BRAND_CARD;
        }
        let body: Uint8Array;
        try {
          body = await renderOgCard(model);
        } catch (err) {
          // A broken photo should not kill the preview: retry without it.
          console.error("[og] render failed, retrying without photo", err);
          body = await renderOgCard({ ...model, photo: null });
        }
        return new Response(body as BodyInit, {
          headers: {
            "content-type": "image/jpeg",
            "cache-control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
