import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { sitemapXml, SITE_URL } from "@/lib/seo";
import { citySearchPaths } from "@/lib/roomsetu/cities";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const sql = await getSql();
        const rows = await sql<{ id: string; updated_at: string }>`
          select l.id, l.updated_at::text as updated_at from listings l
          join profiles pr on pr.user_id = l.owner_id
          where l.status = 'ACTIVE' and l.is_demo = false and pr.is_demo = false and pr.account_status = 'ACTIVE' and pr.identity_status = 'VERIFIED'
          order by l.updated_at desc limit 5000`;
        const xml = sitemapXml(SITE_URL, ["/", "/search", ...citySearchPaths(), "/room-wanted", "/pricing"], rows.map((r) => ({ id: r.id, updatedAt: r.updated_at })));
        return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
