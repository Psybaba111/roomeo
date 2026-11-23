/**
 * Bot checks for the anonymous waitlist form only (waitlist mode itself is unchanged).
 * 1. Honeypot: a visually hidden "website" field real people never fill. Filled -> pretend success, store nothing.
 * 2. Per-IP limit: WAITLIST_IP_LIMIT tries per window, counted in the existing rate-limit table under a
 *    salted hash of the IP (the raw IP is never stored).
 */
export const HONEYPOT_FIELD = "website";
export const WAITLIST_IP_LIMIT = { max: 5, windowMinutes: 60 } as const;

export function honeypotFilled(data: unknown): boolean {
  const v = (data as Record<string, unknown> | null | undefined)?.[HONEYPOT_FIELD];
  return typeof v === "string" && v.trim().length > 0;
}

/** First hop of x-forwarded-for, else x-real-ip. "" when unknown. */
export function clientIpFrom(h: { get(name: string): string | null } | undefined | null): string {
  if (!h) return "";
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return (fwd || h.get("x-real-ip")?.trim() || "").slice(0, 64);
}

/** Stable, non-reversible key for the rate-limit row. Unknown IP shares one bucket. */
export async function waitlistIpKey(ip: string, salt: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip || "unknown"}`)));
  return `wl:${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32)}`;
}
