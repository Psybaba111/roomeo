/**
 * Conversion events sent to GA4 and the Meta Pixel. Both are no-ops unless the tracker was installed
 * (see config.ts: GA events need VITE_GA_MEASUREMENT_ID; the Pixel needs VITE_META_PIXEL_ID).
 * Params are allowlisted: never names, emails, phones, user ids or free text.
 */
import { sanitizePagePath, type Gtag } from "./ga4.ts";
import type { Fbq } from "./pixel.ts";
import { readFirstTouch, utmParams } from "./utm.ts";

export const TRACK_EVENTS = ["sign_up", "listing_created", "request_sent", "quiz_complete", "waitlist_join"] as const;
export type TrackEvent = (typeof TRACK_EVENTS)[number];

/** GA4 name → Meta Pixel call. Standard events where Meta has one, custom otherwise. */
export const PIXEL_EVENT: Record<TrackEvent, { method: "track" | "trackCustom"; name: string }> = {
  sign_up: { method: "track", name: "CompleteRegistration" },
  waitlist_join: { method: "track", name: "Lead" },
  request_sent: { method: "track", name: "Contact" },
  listing_created: { method: "trackCustom", name: "ListingCreated" },
  quiz_complete: { method: "trackCustom", name: "QuizComplete" },
};

const PARAM_KEYS = ["method", "role", "city", "source", "roomie_type", "listing_kind", "listing_id"] as const;
type Params = Partial<Record<(typeof PARAM_KEYS)[number], string>>;

export type TrackWindow = {
  gtag?: Gtag;
  fbq?: Fbq;
  __roomeoGaEvents?: boolean;
  __roomeoPixel?: string;
  location?: { pathname: string };
  localStorage?: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Allowlisted params: short lowercase-ish tokens / city names / a listing uuid. */
export function eventParams(p: Record<string, unknown> = {}): Params {
  const out: Params = {};
  for (const k of PARAM_KEYS) {
    const v = typeof p[k] === "string" ? String(p[k]).trim() : "";
    if (!v) continue;
    if (k === "listing_id") {
      if (UUID.test(v)) out.listing_id = v.toLowerCase();
    } else if (k === "city") {
      if (/^[\p{L} .'-]{1,40}$/u.test(v)) out.city = v;
    } else if (/^[a-z][a-z0-9_]{0,31}$/.test(v)) out[k] = v;
  }
  return out;
}

/** Fire one event to whichever trackers are running. Returns where it went (for tests). */
export function trackEvent(name: TrackEvent, params: Record<string, unknown> = {}, win?: TrackWindow, onGaSent?: () => void): { ga: boolean; pixel: boolean } {
  const w = win ?? (typeof window === "undefined" ? undefined : (window as unknown as TrackWindow));
  const sent = { ga: false, pixel: false };
  if (!w || !(TRACK_EVENTS as readonly string[]).includes(name)) return sent;
  if (!sanitizePagePath(w.location?.pathname ?? "/")) return sent; // never from admin / verification pages
  let ls: TrackWindow["localStorage"];
  try {
    ls = w.localStorage;
  } catch {
    ls = undefined;
  }
  const all = { ...eventParams(params), ...utmParams(readFirstTouch(ls)) };
  try {
    if (w.__roomeoGaEvents && typeof w.gtag === "function") {
      w.gtag("event", name, onGaSent ? { ...all, transport_type: "beacon", event_callback: onGaSent } : all);
      sent.ga = true;
    }
  } catch {
    /* never break the page for analytics */
  }
  try {
    if (w.__roomeoPixel && typeof w.fbq === "function") {
      const m = PIXEL_EVENT[name];
      w.fbq(m.method, m.name, all);
      sent.pixel = true;
    }
  } catch {
    /* ignore */
  }
  return sent;
}

/**
 * Same as trackEvent, but resolves once GA has sent the hit (or after `maxMs`), for events fired right before a full
 * page load (e.g. sign-up → window.location.assign), which would otherwise drop GA's batched hit.
 */
export function trackEventBeforeNavigate(name: TrackEvent, params: Record<string, unknown> = {}, maxMs = 1000, win?: TrackWindow): Promise<{ ga: boolean; pixel: boolean }> {
  return new Promise((resolve) => {
    let out = { ga: false, pixel: false };
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(out);
    };
    out = trackEvent(name, params, win, finish);
    if (!out.ga) finish();
    else setTimeout(finish, maxMs);
  });
}
