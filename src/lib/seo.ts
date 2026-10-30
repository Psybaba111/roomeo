function envBase(): string {
  const vite = import.meta.env?.VITE_SITE_URL as string | undefined;
  const proc =
    typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
  const vercel = proc.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${proc.VERCEL_PROJECT_PRODUCTION_URL}`
    : "";
  return vite || proc.VITE_SITE_URL || proc.BETTER_AUTH_URL || vercel || "http://localhost:3000";
}

/** Single public base URL for canonical links, sitemap and robots.txt. */
export const SITE_URL = envBase().replace(/\/+$/, "");

export function robotsTxt(base: string): string {
  const disallow = [
    "/admin",
    "/admin/",
    "/dashboard",
    "/messages",
    "/applications",
    "/profile",
    "/verification",
  ];
  return [
    "User-agent: *",
    "Allow: /",
    ...disallow.map((d) => `Disallow: ${d}`),
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

export function pageHead(title: string, opts: { description?: string; noindex?: boolean } = {}) {
  const meta: Array<Record<string, string>> = [
    { title: `${title} · roomeo` },
    { property: "og:title", content: `${title} · roomeo` },
  ];
  if (opts.description)
    meta.push(
      { name: "description", content: opts.description },
      { property: "og:description", content: opts.description },
    );
  if (opts.noindex) meta.push({ name: "robots", content: "noindex, nofollow" });
  return { meta };
}

/** Marks a page that ships its own og:/twitter: tags so the platform head injector keeps them. */
export const OWN_OG_META = { name: "roomeo:og", content: "page" } as const;

export function listingOgImageUrl(id: string, base = SITE_URL): string {
  return `${base}/api/og/listing/${encodeURIComponent(id)}.jpg`;
}

export function listingShareMeta(p: { title: string; description: string; url: string; image: string }): Array<Record<string, string>> {
  return [
    OWN_OG_META,
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "roomeo" },
    { property: "og:url", content: p.url },
    { property: "og:image", content: p.image },
    { property: "og:image:type", content: "image/jpeg" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: p.title },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: `${p.title} · roomeo` },
    { name: "twitter:description", content: p.description },
    { name: "twitter:image", content: p.image },
  ];
}

type ListingSeo = {
  id: string;
  title: string;
  locality: string;
  city: string;
  rent: number;
  roomType: string;
  availableFrom: string;
  description: string;
  images: { url: string }[];
  isDemo: boolean;
};

export function listingJsonLd(room: ListingSeo) {
  const url = `${SITE_URL}/listing/${room.id}`;
  return {
    "@context": "https://schema.org",
    "@type": "Offer",
    url,
    name: room.title,
    description: room.description.slice(0, 300),
    price: room.rent,
    priceCurrency: "INR",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: room.rent,
      priceCurrency: "INR",
      unitText: "MONTH",
    },
    availability: "https://schema.org/InStock",
    availabilityStarts: room.availableFrom || undefined,
    image: room.images.map((i) => i.url).slice(0, 5),
    itemOffered: {
      "@type": "Accommodation",
      name: `${room.roomType} in ${room.locality}`,
      address: {
        "@type": "PostalAddress",
        addressLocality: room.locality,
        addressRegion: room.city,
        addressCountry: "IN",
      },
    },
  };
}

export function listingHead(room: (ListingSeo & { held?: false }) | { held: true } | undefined) {
  if (!room) return pageHead("Bed not available", { noindex: true });
  if (room.held === true) return pageHead("Bed not public yet", { noindex: true });
  const title = `${room.roomType} in ${room.locality} · ₹${room.rent.toLocaleString("en-IN")}/mo`;
  const description = `${room.title}. ${room.roomType} in ${room.locality}, ${room.city} for ₹${room.rent.toLocaleString("en-IN")} a month. Chat the owner free, no broker's month.`;
  const head = pageHead(title, { description, noindex: room.isDemo });
  // Always our own share card (photo + all-in price + area + badge). Listing photos are data URLs that chat apps can't fetch.
  const image = listingOgImageUrl(room.id);
  const url = `${SITE_URL}/listing/${room.id}`;
  head.meta.push(...listingShareMeta({ title, description, url, image }));
  return {
    ...head,
    links: [{ rel: "canonical", href: `${SITE_URL}/listing/${room.id}` }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(listingJsonLd(room)) }],
  };
}

export function sitemapXml(
  base: string,
  staticPaths: string[],
  listings: { id: string; updatedAt: string }[],
): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const urls = [
    ...staticPaths.map((p) => `<url><loc>${esc(base + p)}</loc></url>`),
    ...listings.map(
      (l) =>
        `<url><loc>${esc(`${base}/listing/${l.id}`)}</loc>${l.updatedAt ? `<lastmod>${esc(l.updatedAt.slice(0, 10))}</lastmod>` : ""}</url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
