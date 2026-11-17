/**
 * Listing photos are stored as data: URLs in listing_images.url. Shipping them inside SSR / server-function
 * payloads made the homepage HTML ~370 KB (4 photos × ~87 KB of base64). Cards and the listing page now get a
 * short, CDN-cacheable URL instead (/api/img/<image id>), served by src/routes/api/img.$id.ts.
 * Pure helpers: safe for node:test and the client bundle.
 */
export const LISTING_IMAGE_PATH = "/api/img/";
const ID = /^[0-9A-Za-z_-]{6,80}$/;

/** SQL expression for a listing_images row's display URL (alias = the listing_images alias). Big data: URLs never leave Postgres. */
export function imageUrlSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error("bad alias");
  return `(case when ${alias}.url like 'data:%' then '${LISTING_IMAGE_PATH}' || ${alias}.id else ${alias}.url end)`;
}

export function isImageId(id: string): boolean {
  return ID.test(id);
}

/** Decode a data: URL photo (JPG / PNG / WebP only). null when it isn't one. */
export function decodeDataUrl(url: string): { type: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
  if (!m) return null;
  try {
    const bin = atob(m[2].replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { type: m[1], bytes };
  } catch {
    return null;
  }
}

/** Photos get new ids when an owner edits, so caching is safe; kept to 1 day at the CDN so a hidden / removed listing's photo stops being served within a day. */
export const IMAGE_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";
