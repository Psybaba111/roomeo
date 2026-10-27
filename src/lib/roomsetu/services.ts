/** Storage, maps, and payments are interfaces. Swap the adapter later without touching screens. */

const MAX_DATA_URL = 280_000;

export function logEvent(event: string, detail: Record<string, string | number | boolean> = {}) {
  console.info(JSON.stringify({ app: "roomsetu", event, ...detail, at: new Date().toISOString() }));
}

function headBytes(b64: string, n: number): number[] {
  const slice = b64.replace(/\s/g, "").slice(0, Math.ceil((n * 4) / 3) + 4);
  let bin = "";
  try {
    bin = atob(slice);
  } catch {
    return [];
  }
  const out: number[] = [];
  for (let i = 0; i < Math.min(n, bin.length); i++) out.push(bin.charCodeAt(i));
  return out;
}

export function likeContains(value: string): string {
  return `%${value.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function photoUrlError(url: string): string | null {
  if (url.length > 400_000) return "That photo is too large. Try a smaller one.";
  if (url.startsWith("data:image/")) {
    if (url.length > MAX_DATA_URL + 80) return "That photo is too large. Try a smaller one.";
    const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
    if (!match) return "Use a JPG, PNG, or WebP photo.";
    const b64 = match[2].replace(/\s/g, "");
    if (b64.length < 32) return "That photo looks empty.";
    if (b64.length > MAX_DATA_URL) return "That photo is too large. Try a smaller one.";
    const kind = match[1] === "jpg" ? "jpeg" : match[1];
    const bytes = headBytes(b64, 16);
    if (bytes.length < 4) return "That photo could not be read.";
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const webp =
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50;
    if (kind === "jpeg" && !jpeg) return "That file is not a JPEG.";
    if (kind === "png" && !png) return "That file is not a PNG.";
    if (kind === "webp" && !webp) return "That file is not a WebP.";
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "That photo link is not valid.";
  }
  if (parsed.protocol !== "https:") return "Photos have to use https.";
  if (url.length > 400) return "That photo link is too long.";
  return null;
}

export function fileUploadError(file: { type: string; bytes: number }): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Use a JPG, PNG, or WebP photo.";
  }
  if (file.bytes > 8_000_000) return "Each photo needs to be under 8 MB before it is resized.";
  return null;
}

export function mapEmbed(lat: number, lng: number): string {
  const pad = 0.03;
  const bbox = [lng - pad, lat - pad, lng + pad, lat + pad].map((n) => n.toFixed(5)).join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)}%2C${lng.toFixed(5)}`;
}

/** Plan payments use direct UPI (see upi.ts). Razorpay is deprecated and only guards the legacy rent flow. */
export const payments = {
  provider: "upi" as const,
  configured: true,
  reason: "Plans are paid by direct UPI. Razorpay is not used.",
};
