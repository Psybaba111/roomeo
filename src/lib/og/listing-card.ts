/** Pure model + layout for the per-listing share card (1200x630). Rendered by listing-card.server.ts. */
export const OG_W = 1200;
export const OG_H = 630;

export type OgListing = {
  title: string;
  roomType: string;
  locality: string;
  city: string;
  rent: number;
  allInInr: number | null;
  verified: boolean;
  photo: string | null;
  description?: string;
};

export type OgCardModel = {
  headline: string;
  priceLabel: string;
  priceNote: string;
  area: string;
  verified: boolean;
  photo: string | null;
  aiPhoto?: boolean;
};

export const AI_PHOTO_LABEL = "AI photo · for representation only";

/** Owners flag AI preview photos in the description ("AI photos for representation purpose only"). */
export function hasAiPhotos(description: string | null | undefined): boolean {
  const d = String(description ?? "").toLowerCase();
  return /\bai[- ]?(generated )?(photo|image|render|picture)s?\b/.test(d) || /for representation (purpose|only)/.test(d);
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Only inline JPEG/PNG (what satori/resvg can paint) or http(s) URLs we can fetch. */
export function usablePhoto(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^data:image\/(jpeg|jpg|png);base64,/i.test(url)) return url;
  if (/^https:\/\//i.test(url)) return url;
  return null;
}

export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function ogCardModel(l: OgListing): OgCardModel {
  const allIn = Boolean(l.allInInr && l.allInInr > 0);
  const amount = allIn ? (l.allInInr as number) : l.rent;
  return {
    headline: clip(l.title || `${l.roomType} in ${l.locality}`, 70),
    priceLabel: `${rupees(amount)}/mo`,
    priceNote: allIn ? "all-in · no surprise extras" : "rent · chat the owner free",
    area: clip([l.locality, l.city].filter(Boolean).join(", "), 40),
    verified: l.verified,
    photo: usablePhoto(l.photo),
    aiPhoto: Boolean(usablePhoto(l.photo)) && hasAiPhotos(l.description),
  };
}

type El = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): El => ({
  type,
  props: { style, children, ...extra },
});

const BRAND = "#d1006b";
const INK = "#14111f";

/** Satori element tree. Plain objects so no JSX runtime is needed on the server. */
export function ogCardTree(m: OgCardModel): El {
  const pill = (text: string, bg: string, color: string) =>
    el("div", { display: "flex", alignItems: "center", padding: "10px 20px", borderRadius: 999, background: bg, color, fontSize: 28, fontWeight: 800 }, text);
  const left = m.photo
    ? el("div", { display: "flex", position: "relative", width: 560, height: OG_H }, [
        el("img", { width: 560, height: OG_H, objectFit: "cover" }, undefined, { src: m.photo, width: 560, height: OG_H }),
        ...(m.aiPhoto
          ? [el("div", { display: "flex", position: "absolute", left: 20, bottom: 20, padding: "8px 16px", borderRadius: 999, background: "rgba(20,17,31,0.82)", color: "#fff", fontSize: 22, fontWeight: 600 }, AI_PHOTO_LABEL)]
          : []),
      ])
    : el("div", { width: 560, height: OG_H, display: "flex", alignItems: "center", justifyContent: "center", background: BRAND, color: "#fff", fontSize: 140, fontWeight: 800 }, "roomeo");
  const right = el(
    "div",
    { display: "flex", flexDirection: "column", justifyContent: "space-between", width: OG_W - 560, height: OG_H, padding: "48px 52px", background: "#fff7fb", color: INK },
    [
      el("div", { display: "flex", alignItems: "center", gap: 14 }, [
        el("div", { display: "flex", fontSize: 44, fontWeight: 800, color: BRAND, letterSpacing: -1 }, "roomeo"),
        el("div", { display: "flex", fontSize: 22, fontWeight: 600, color: "#6b6478" }, "free for renters + owners"),
      ]),
      el("div", { display: "flex", flexDirection: "column", gap: 14 }, [
        el("div", { display: "flex", fontSize: 40, fontWeight: 800, lineHeight: 1.15 }, m.headline),
        el("div", { display: "flex", fontSize: 28, fontWeight: 600, color: "#6b6478" }, m.area),
      ]),
      el("div", { display: "flex", flexDirection: "column", gap: 18 }, [
        el("div", { display: "flex", alignItems: "baseline", gap: 14 }, [
          el("div", { display: "flex", fontSize: 72, fontWeight: 800, color: INK, letterSpacing: -2 }, m.priceLabel),
        ]),
        el("div", { display: "flex", fontSize: 24, fontWeight: 600, color: "#6b6478" }, m.priceNote),
        el("div", { display: "flex", gap: 12 }, [
          m.verified ? pill("✓ verified by phone", "#14532d", "#fff") : pill("chat the owner free", INK, "#fff"),
        ]),
      ]),
    ],
  );
  return el("div", { display: "flex", width: OG_W, height: OG_H, fontFamily: "Inter" }, [left, right]);
}
