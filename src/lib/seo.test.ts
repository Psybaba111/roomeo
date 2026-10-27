import test from "node:test";
import assert from "node:assert/strict";
import { listingHead, listingJsonLd, pageHead, sitemapXml } from "./seo.ts";

const room = { id: "abc-123", title: "Sunny bed", locality: "HSR Layout", city: "Bengaluru", rent: 12000, roomType: "Shared room", availableFrom: "2026-11-01", description: "Near 27th Main", images: [{ url: "https://x/y.jpg" }], isDemo: false };

test("listing json-ld is a schema.org Offer in INR", () => {
  const ld = listingJsonLd(room);
  assert.equal(ld["@type"], "Offer");
  assert.equal(ld.price, 12000);
  assert.equal(ld.priceCurrency, "INR");
  assert.equal(ld.itemOffered.address.addressLocality, "HSR Layout");
});

test("listing head has title, og image, canonical; demo and held are noindex", () => {
  const h = listingHead(room);
  assert.ok(!listingHead({ ...room, held: false }).meta.some((m) => m.name === "robots"), "held:false is public");
  assert.ok(h.meta.some((m) => m.title?.includes("HSR Layout")));
  assert.ok(h.meta.some((m) => m.property === "og:image"));
  assert.ok(!h.meta.some((m) => m.name === "robots"));
  assert.ok(listingHead({ ...room, isDemo: true }).meta.some((m) => m.name === "robots"));
  assert.ok(listingHead({ held: true }).meta.some((m) => m.name === "robots"));
  assert.equal(pageHead("Search").meta[0].title, "Search · roomeo");
});

test("sitemap escapes and lists listings", () => {
  const xml = sitemapXml("https://roomeo.com", ["/", "/search"], [{ id: "a&b", updatedAt: "2026-10-01T00:00:00Z" }]);
  assert.ok(xml.includes("<loc>https://roomeo.com/search</loc>"));
  assert.ok(xml.includes("/listing/a&amp;b</loc><lastmod>2026-10-01</lastmod>"));
});
