/**
 * Conversion events sent to GA4 and the Meta Pixel. Both are no-ops unless the tracker was installed
 * (see config.ts: GA events need VITE_GA_MEASUREMENT_ID; the Pixel needs VITE_META_PIXEL_ID).
 * Params are allowlisted: never names, emails, phones, user ids or free text.
 */
import { sanitizePagePath, type Gtag } from "./ga4.ts";
import type { Fbq } from "./pixel.ts";
import { readFirstTouch, utmParams } from "./utm.ts";

/**
 * The booking funnel (25 Nov 2026), in order: search → listing_view → request_submitted → owner_responded →
 * request_accepted → payment_completed → moved_in, plus whatsapp_click. Each carries listing_id + city where the
 * step has a listing (search has only city / area). The server-side steps are also written to funnel_events.
 */
export const FUNNEL_EVENTS = ["search", "listing_view", "request_submitted", "owner_responded", "request_accepted", "payment_completed", "moved_in", "whatsapp_click"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export const TRACK_EVENTS = ["sign_up", "listing_created", "request_sent", "quiz_complete", "waitlist_join", ...FUNNEL_EVENTS] as const;
export type TrackEvent = (typeof TRACK_EVENTS)[number];

/** GA4 name → Meta Pixel call. Standard events where Meta has one, custom otherwise. */
export const PIXEL_EVENT: Record<TrackEvent, { method: "track" | "trackCustom"; name: string }> = {
  sign_up: { method: "track", name: "CompleteRegistration" },
  waitlist_join: { method: "track", name: "Lead" },
  request_sent: { method: "track", name: "Contact" },
  listing_created: { method: "trackCustom", name: "ListingCreated" },
  quiz_complete: { method: "trackCustom", name: "QuizComplete" },
  search: { method: "track", name: "Search" },
  listing_view: { method: "track", name: "ViewContent" },
  request_submitted: { method: "trackCustom", name: "RequestSubmitted" },
  owner_responded: { method: "trackCustom", name: "OwnerResponded" },
  request_accepted: { method: "trackCustom", name: "RequestAccepted" },
  payment_completed: { method: "trackCustom", name: "PaymentCompleted" },
  moved_in: { method: "trackCustom", name: "MovedIn" },
  whatsapp_click: { method: "trackCustom", name: "WhatsAppClick" },
};

const PARAM_KEYS = ["method", "role", "city", "area", "source", "roomie_type", "listing_kind", "listing_id", "decision"] as const;
type Params = Partial<Record<(typeof PARAM_KEYS)[number], string>>;

export type TrackWindow = {
  gtag?: Gtag;
  fbq?: Fbq;
  __roomeoGaEvents?: boolean;
  __roomeoGaInternal?: boolean;
  __roomeoPixel?: string;
  /** Last 50 events this page tried to send (name + allowlisted params only). For QA on previews, where GA is off. */
  __roomeoEventLog?: Array<{ name: string; params: Record<string, string>; ga: boolean }>;
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
    } else if (k === "city" || k === "area") {
      if (/^[\p{L} .'-]{1,40}$/u.test(v)) out[k] = v;
    } else if (/^[a-z][a-z0-9_]{0,31}$/.test(v)) out[k] = v;
  }
  return out;
}

/** Fire one event to whichever trackers are running. Returns where it went (for tests). */
export function trackEvent(name: TrackEvent, params: Record<string, unknown> = {}, win?: TrackWindow): { ga: boolean; pixel: boolean } {
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
      // Preview / test traffic: debug_mode so it shows in GA DebugView (traffic_type=internal is set globally).
      w.gtag("event", name, w.__roomeoGaInternal ? { ...all, debug_mode: true } : all);
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
  try {
    const log = (w.__roomeoEventLog ??= []);
    log.push({ name, params: all, ga: sent.ga });
    if (log.length > 50) log.splice(0, log.length - 50);
  } catch {
    /* ignore */
  }
  return sent;
}

/** sessionStorage key for events fired right before a full page load (sent by the next page once GA is up). */
export const PENDING_EVENTS_KEY = "roomeo_pending_ev";
type Pending = { name: TrackEvent; params: Params; at: number };
type SessionStore = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void };

/**
 * For an event fired just before window.location changes (email sign-up): GA batches hits for a few seconds, so a
 * hit queued right before a full page load is lost. Park it in sessionStorage; the next page sends it once the
 * trackers are installed (flushPendingEvents). Max 5, dropped after 10 minutes.
 */
export function queueEventForNextPage(name: TrackEvent, params: Record<string, unknown> = {}, store?: SessionStore | null, now = Date.now()): boolean {
  const s = store ?? (typeof window === "undefined" ? null : safeSession());
  if (!s || !(TRACK_EVENTS as readonly string[]).includes(name)) return false;
  try {
    const list = readPending(s).slice(-4);
    list.push({ name, params: eventParams(params), at: now });
    s.setItem(PENDING_EVENTS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Send parked events (called once GA / the Pixel are installed). Returns how many were sent to at least one tracker. */
export function flushPendingEvents(win?: TrackWindow, store?: SessionStore | null, now = Date.now()): number {
  const s = store ?? (typeof window === "undefined" ? null : safeSession());
  if (!s) return 0;
  const list = readPending(s);
  try {
    s.removeItem(PENDING_EVENTS_KEY);
  } catch {
    /* ignore */
  }
  let n = 0;
  for (const e of list) {
    if (now - e.at > 10 * 60_000) continue;
    const r = trackEvent(e.name, e.params, win);
    if (r.ga || r.pixel) n++;
  }
  return n;
}

function readPending(s: SessionStore): Pending[] {
  try {
    const raw = JSON.parse(s.getItem(PENDING_EVENTS_KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e): e is Pending => Boolean(e) && typeof e === "object" && (TRACK_EVENTS as readonly string[]).includes((e as Pending).name) && typeof (e as Pending).at === "number")
      .map((e) => ({ name: e.name, params: eventParams(e.params as Record<string, unknown>), at: e.at }))
      .slice(-5);
  } catch {
    return [];
  }
}

function safeSession(): SessionStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
