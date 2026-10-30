// Trust-first listing fields (Oct 2026 pivot): one all-in price, written deposit terms,
// optional video tour and dated photos. Pure helpers so the rules are tested in one place.

export const DEFAULT_REFUND_DAYS = 7;
export const REVIEWS_NOTE =
  "Reviews are never tied to your deposit. Your refund doesn't depend on what you write.";

export type TrustFields = {
  allInInr: number | null;
  allInIncludes: string;
  videoTourUrl: string;
  depositRefundDays: number;
};

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Accepts only https links (YouTube, Drive, Instagram, anything public). Empty is fine. */
export function videoUrlError(url: string): string {
  if (!url) return "";
  if (url.length > 500) return "That video link is too long.";
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "Paste a full video link starting with https://";
  }
  if (u.protocol !== "https:") return "Video link must start with https://";
  return "";
}

/** Validate the optional trust fields from a create or edit form. */
export function trustOf(input: unknown, monthlyRent: number): TrustFields {
  const o = rec(input);
  const rawAllIn = o.allInInr;
  const allIn =
    rawAllIn === undefined || rawAllIn === null || rawAllIn === "" ? null : Number(rawAllIn);
  if (allIn !== null && !(Number.isInteger(allIn) && allIn >= 1500 && allIn <= 500000))
    throw new Error("All-in price looks off. Use ₹1,500 to ₹5,00,000.");
  if (allIn !== null && monthlyRent > 0 && allIn < monthlyRent)
    throw new Error("All-in price can't be lower than the rent.");
  const allInIncludes =
    typeof o.allInIncludes === "string"
      ? o.allInIncludes.trim().replace(/\s+/g, " ").slice(0, 200)
      : "";
  if (allIn !== null && !allInIncludes)
    throw new Error("Say what the all-in price includes, like rent, food, wifi, power.");
  const videoTourUrl = typeof o.videoTourUrl === "string" ? o.videoTourUrl.trim() : "";
  const vErr = videoUrlError(videoTourUrl);
  if (vErr) throw new Error(vErr);
  const rawDays = o.depositRefundDays;
  const days =
    rawDays === undefined || rawDays === null || rawDays === ""
      ? DEFAULT_REFUND_DAYS
      : Number(rawDays);
  if (!(Number.isInteger(days) && days >= 1 && days <= 60))
    throw new Error("Deposit refund window should be 1 to 60 days.");
  return { allInInr: allIn, allInIncludes, videoTourUrl, depositRefundDays: days };
}

/** "Deposit ₹10,000 · refunded within 7 days of move-out". */
export function depositTerms(depositInr: number, refundDays: number): string {
  if (!depositInr) return "No deposit";
  return `Deposit ₹${depositInr.toLocaleString("en-IN")} · refunded within ${refundDays} day${refundDays === 1 ? "" : "s"} of move-out`;
}

/** "Photo updated 12 Oct 2026", or "" when the upload date is unknown (older photos). */
export function photoDateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const s = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  return `Photo updated ${s}`;
}

/** The big number on a listing: all-in when the owner gave one, else rent. */
export function headlinePrice(
  rent: number,
  allInInr: number | null,
): { amount: number; allIn: boolean } {
  return allInInr ? { amount: allInInr, allIn: true } : { amount: rent, allIn: false };
}
