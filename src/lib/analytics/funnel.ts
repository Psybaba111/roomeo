/**
 * Browser side of the booking funnel (25 Nov 2026). Event names / params live in events.ts; this file decides WHEN to
 * fire them. Pure helpers take their window / storage so node tests can cover them.
 */
import { trackEvent, type TrackWindow } from "./events.ts";

/** listing_id + city for a WhatsApp link, read from the nearest `data-funnel-listing` / `data-funnel-city` ancestor. */
export type FunnelContext = { listing_id?: string; city?: string };

const WA = /^https?:\/\/(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//i;

export function isWhatsAppHref(href: string | null | undefined): boolean {
  return WA.test(String(href ?? "")) || /^whatsapp:/i.test(String(href ?? ""));
}

/** Where the tap was: "share" for a share link (wa.me/?text=), "support" for our own number, "other" otherwise. */
export function whatsappSource(href: string): "share" | "support" | "other" {
  if (/wa\.me\/\?text=|api\.whatsapp\.com\/send\?text=/i.test(href)) return "share";
  if (/wa\.me\/\d/i.test(href)) return "support";
  return "other";
}

type El = { closest?: (sel: string) => El | null; getAttribute?: (n: string) => string | null } | null;

/** Find the funnel context around a clicked element (pure over a minimal DOM surface). */
export function funnelContextOf(el: El): FunnelContext {
  const host = el?.closest?.("[data-funnel-listing],[data-funnel-city]") ?? null;
  const out: FunnelContext = {};
  const id = host?.getAttribute?.("data-funnel-listing");
  const city = host?.getAttribute?.("data-funnel-city");
  if (id) out.listing_id = id;
  if (city) out.city = city;
  return out;
}

/** Fire whatsapp_click for a click event target if it is (inside) a WhatsApp link. Returns whether it fired. */
export function trackWhatsAppClick(target: El, win?: TrackWindow): boolean {
  const a = target?.closest?.("a[href]") ?? null;
  const href = a?.getAttribute?.("href") ?? "";
  if (!isWhatsAppHref(href)) return false;
  trackEvent("whatsapp_click", { ...funnelContextOf(a), source: whatsappSource(href) }, win);
  return true;
}

/** After the owner's accept / decline (setApplication result). Only the first reply per request counts. */
export function trackOwnerDecision(status: string, res: { listingId?: string; city?: string; firstReply?: boolean } | null | undefined, win?: TrackWindow): string[] {
  if (!res?.firstReply || (status !== "ACCEPTED" && status !== "DECLINED")) return [];
  const p = { listing_id: res.listingId, city: res.city };
  trackEvent("owner_responded", { ...p, decision: status === "ACCEPTED" ? "accepted" : "declined" }, win);
  if (status !== "ACCEPTED") return ["owner_responded"];
  trackEvent("request_accepted", p, win);
  return ["owner_responded", "request_accepted"];
}

export const HANDOFF_SENT_KEY = "roomeo.funnel.sent.v1";
type Store = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };

/**
 * Send server-logged steps (payment_completed, moved_in) from the person's own browser, each at most once per browser.
 * An event is only marked sent once GA actually took it, so a page without GA (consent pending, preview) retries later.
 */
export function sendHandoff(list: Array<{ id: string; kind: string; listingId: string; city: string }>, store: Store | null, win?: TrackWindow): number {
  let sent: string[] = [];
  try {
    sent = JSON.parse(store?.getItem(HANDOFF_SENT_KEY) || "[]") as string[];
    if (!Array.isArray(sent)) sent = [];
  } catch {
    sent = [];
  }
  let n = 0;
  for (const e of list) {
    if (sent.includes(e.id) || (e.kind !== "payment_completed" && e.kind !== "moved_in")) continue;
    const r = trackEvent(e.kind, { listing_id: e.listingId, city: e.city }, win);
    if (r.ga || r.pixel) {
      sent.push(e.id);
      n++;
    }
  }
  try {
    store?.setItem(HANDOFF_SENT_KEY, JSON.stringify(sent.slice(-100)));
  } catch {
    /* storage blocked */
  }
  return n;
}
