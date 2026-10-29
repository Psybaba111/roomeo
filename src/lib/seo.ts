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
  const image = room.images[0]?.url;
  head.meta.push(
    { property: "og:type", content: "website" },
    { property: "og:url", content: `${SITE_URL}/listing/${room.id}` },
  );
  if (image)
    head.meta.push(
      { property: "og:image", content: image },
      { name: "twitter:card", content: "summary_large_image" },
    );
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
