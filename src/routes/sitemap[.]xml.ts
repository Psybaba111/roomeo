import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { sitemapXml, SITE_URL } from "@/lib/seo";
import { citySearchPaths } from "@/lib/roomsetu/cities";
import { waitlistModeOn } from "@/lib/roomsetu/waitlist";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Waitlist mode: only pages that are open to everyone (no search, no listings).
        if (waitlistModeOn(process.env)) {
          const xml = sitemapXml(SITE_URL, ["/", "/waitlist", "/list-your-bed", "/pricing", "/privacy", "/terms", "/refund-policy"], []);
          return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
        }
        const sql = await getSql();
        const rows = await sql<{ id: string; updated_at: string }>`
          select l.id, l.updated_at::text as updated_at from listings l
          join profiles pr on pr.user_id = l.owner_id
          where l.status = 'ACTIVE' and l.is_demo = false and pr.is_demo = false and pr.account_status = 'ACTIVE' and pr.identity_status = 'VERIFIED'
          order by l.updated_at desc limit 5000`;
        const xml = sitemapXml(SITE_URL, ["/", "/search", ...citySearchPaths(), "/room-wanted", "/list-your-bed", "/pricing", "/privacy", "/terms", "/refund-policy"], rows.map((r) => ({ id: r.id, updatedAt: r.updated_at })));
        return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
