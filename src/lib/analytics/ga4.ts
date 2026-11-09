// GA4 (G-MY0R3B2T7T) helpers. Pure and DOM-free at import time, so the server
// bundle and node:test can load it. Nothing here touches `window` unless the
// caller passes it in from a client-only effect.
//
// Privacy rules (see PR notes): we only ever send a scrubbed route path such as
// /listing/:id. No query string, no hash, no ids/tokens/codes, no emails or
// phones, no user ids, no listing titles. Admin + verification pages are never
// tracked. Page views are manual (send_page_view: false) so GA's own history
// tracking must stay off in GA admin to avoid double counting.
//
// Why `set` comes before `js`/`config` (found by capturing /g/collect hits):
// loading gtag.js?id=G-… auto-configures the Google tag, which fires its own
// page-load page_view from the raw document.location / document.title. That hit
// ignores everything passed to gtag('config', …), including send_page_view:false,
// but it does honour fields queued earlier with gtag('set', …). So we `set`
// send_page_view:false plus scrubbed page fields first.
//
// Enhanced Measurement's history-change page_view reads the real URL at send
// time and can't be switched off from code (Google: GA admin only). The collect
// guard below rewrites dl/dr/dt on every outgoing GA hit as a backstop.

export const GA_MEASUREMENT_ID = "G-MY0R3B2T7T";
export const GA_SCRIPT_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;

/** Known dynamic routes -> placeholder. Checked before the generic id scrub. */
const ROUTE_PATTERNS: [RegExp, string][] = [
  [/^\/listing\/[^/]+$/, "/listing/:id"],
  [/^\/edit-listing\/[^/]+$/, "/edit-listing/:id"],
  [/^\/invoice\/[^/]+$/, "/invoice/:id"],
  [/^\/move-in\/[^/]+$/, "/move-in/:token"],
  [/^\/r\/[^/]+$/, "/r/:code"],
  [/^\/squads\/join\/[^/]+$/, "/squads/join/:code"],
  [/^\/squads\/(?!join$)[^/]+$/, "/squads/:id"],
];

/** Pages we never send: operator tools and ID / phone verification flows. */
const EXCLUDED: RegExp[] = [/^\/admin(?:[-/]|$)/, /^\/verification(?:\/|$)/, /^\/verify(?:[-/]|$)/, /^\/api(?:\/|$)/];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A path segment that looks like an identifier, token, phone or email. */
function looksSensitive(seg: string): boolean {
  if (UUID.test(seg)) return true;
  if (/@|%40/i.test(seg)) return true; // email-ish
  if (/\d{5,}/.test(seg)) return true; // phone numbers, numeric ids
  if (seg.length >= 16 && /\d/.test(seg)) return true; // long tokens / hashes
  if (seg.length > 40) return true;
  return false;
}

/** Path only: drop scheme/host, query string and hash; tidy slashes. */
export function stripToPath(raw: string): string {
  let s = String(raw ?? "");
  const cut = s.search(/[?#]/);
  if (cut >= 0) s = s.slice(0, cut);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
  s = s.replace(/\/{2,}/g, "/");
  if (!s.startsWith("/")) s = `/${s}`;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s;
}

/**
 * Scrubbed page_path for GA, or null when the page must not be tracked.
 * Never returns query strings, hashes or raw dynamic segments.
 */
export function sanitizePagePath(raw: string): string | null {
  const path = stripToPath(raw);
  const lower = path.toLowerCase();
  if (EXCLUDED.some((re) => re.test(lower))) return null;
  for (const [re, label] of ROUTE_PATTERNS) if (re.test(lower)) return label;
  const scrubbed = path
    .split("/")
    .map((seg) => (seg && looksSensitive(seg) ? ":id" : seg))
    .join("/");
  return scrubbed.slice(0, 200) || "/";
}

/** Campaign params GA reads from page_location. Everything else in a query string is dropped. */
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export const UTM_MAX_LEN = 100;

/** A utm value that could identify a person (email, phone, uuid) is dropped. */
function utmValueOk(v: string): boolean {
  if (!v) return false;
  if (/@|%40/i.test(v)) return false;
  if ((v.match(/\d/g) || []).length >= 9) return false; // phone numbers (Indian mobiles are 10 digits)
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(v)) return false;
  return true;
}

/** "?utm_source=…&utm_medium=…" (allowlisted, encoded, capped) or "" from any url / query string. */
export function utmQuery(raw: string): string {
  const str = String(raw ?? "");
  const q = str.indexOf("?");
  if (q < 0) return "";
  const hash = str.indexOf("#", q);
  const params = new URLSearchParams(str.slice(q + 1, hash >= 0 ? hash : undefined));
  const out: string[] = [];
  for (const key of UTM_KEYS) {
    // eslint-disable-next-line no-control-regex
    const value = (params.get(key) ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, UTM_MAX_LEN);
    if (utmValueOk(value)) out.push(`${key}=${encodeURIComponent(value)}`);
  }
  return out.length ? `?${out.join("&")}` : "";
}

/** Scrubbed absolute page_location: origin + scrubbed path + allowlisted utm_* only. null = excluded page. */
export function sanitizePageLocation(raw: string, origin: string): string | null {
  const path = sanitizePagePath(raw);
  if (!path) return null;
  return `${origin}${path}${utmQuery(raw)}`;
}

/** Referrer for GA: our own pages as scrubbed URLs, other sites as bare origin. */
export function sanitizeReferrer(referrer: string, ownOrigin: string): string {
  if (!referrer) return "";
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return "";
  }
  if (url.origin !== ownOrigin) return url.protocol.startsWith("http") ? url.origin : "";
  const p = sanitizePagePath(url.pathname);
  return p ? `${ownOrigin}${p}` : ownOrigin;
}

/** Hosts we never load GA on: local dev, LAN, and Vercel branch previews. */
export function shouldTrackHost(hostname: string): boolean {
  const h = String(hostname || "").toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return false;
  if (/^(127\.|10\.|192\.168\.|0\.0\.0\.0$|\[?::1\]?$)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h.endsWith(".vercel.app") && h.includes("-git-")) return false;
  return true;
}

export type Gtag = (...args: unknown[]) => void;

export type GaWindow = { dataLayer?: unknown[]; gtag?: Gtag; __roomeoGa4?: boolean };
export type GaDocument = {
  head: { appendChild: (el: unknown) => unknown };
  createElement: (tag: string) => { async?: boolean; src?: string };
  querySelector: (sel: string) => unknown;
};

/**
 * Install gtag exactly once: dataLayer, gtag('js'), gtag('config', ..., {send_page_view:false})
 * and one async <script> in <head>. Safe to call repeatedly (StrictMode, remounts).
 */
export type PageFields = { page_location: string; page_title: string; page_referrer: string };

/** Scrubbed page fields for the page we're on now (excluded pages map to the bare origin). */
export function initialPageFields(href: string, origin: string, referrer: string): PageFields {
  const p = sanitizePagePath(href);
  return {
    page_location: sanitizePageLocation(href, origin) ?? `${origin}/`,
    page_title: p ? `roomeo ${p}` : "roomeo",
    page_referrer: sanitizeReferrer(referrer, origin),
  };
}

export function installGtag(win: GaWindow, doc: GaDocument, origin: string, initial?: PageFields): Gtag {
  if (win.__roomeoGa4 && win.gtag) return win.gtag;
  win.dataLayer = win.dataLayer || [];
  const gtag: Gtag =
    win.gtag ||
    function gtag() {
      // gtag.js expects the arguments object itself, not an array.
      // eslint-disable-next-line prefer-rest-params
      (win.dataLayer as unknown[]).push(arguments);
    };
  win.gtag = gtag;
  // Never let GA read the raw URL / title / referrer (could hold ids or query strings).
  const fields = initial ?? { page_location: `${origin}/`, page_title: "roomeo", page_referrer: "" };
  // MUST be queued before 'js'/'config': the auto-configured Google tag fires its
  // page-load page_view from global `set` fields only (config params are ignored for it).
  gtag("set", { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, ...fields });
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...fields,
  });
  if (!doc.querySelector(`script[src="${GA_SCRIPT_SRC}"]`)) {
    const s = doc.createElement("script");
    s.async = true;
    s.src = GA_SCRIPT_SRC;
    doc.head.appendChild(s);
  }
  win.__roomeoGa4 = true;
  return gtag;
}

/** Marks our own page_view hits so the collect guard can drop gtag's automatic ones. */
export const OUR_PAGE_VIEW_PARAM = "roomeo_pv";

/**
 * Returns `track(href)`: sends one page_view per distinct client navigation.
 * Repeats of the same pathname (StrictMode double effects, the router re-resolving
 * after hydration or an invalidate, query-only / hash-only changes) are ignored.
 * Excluded pages send nothing but still count as "where we are now".
 * page_location keeps allowlisted utm_* params only (see sanitizePageLocation).
 */
export function createPageViewTracker(gtag: Gtag, origin: string, initialReferrer = "") {
  let lastPathname: string | null = null;
  let lastLocation = "";
  return function track(rawHref: string): boolean {
    const pathname = stripToPath(rawHref);
    if (pathname === lastPathname) return false;
    lastPathname = pathname;
    const pagePath = sanitizePagePath(pathname);
    if (!pagePath) {
      lastLocation = origin; // don't leak an excluded page as the next referrer
      return false;
    }
    const pageLocation = `${origin}${pagePath}${utmQuery(rawHref)}`;
    const pageReferrer = lastLocation || sanitizeReferrer(initialReferrer, origin);
    const params = { page_location: pageLocation, page_path: pagePath, page_title: `roomeo ${pagePath}`, page_referrer: pageReferrer, [OUR_PAGE_VIEW_PARAM]: 1 };
    // `set` keeps any later automatic event on the scrubbed values too.
    gtag("set", { page_location: pageLocation, page_title: params.page_title, page_referrer: pageReferrer });
    gtag("event", "page_view", params);
    lastLocation = `${origin}${pagePath}`; // referrers never carry utm_*
    return true;
  };
}

// ---------------------------------------------------------------------------
// Collect guard: last line of defence for hits gtag builds itself (Enhanced
// Measurement history page_views, scroll, user_engagement, clicks...). Every
// GA4 /g/collect request has dl (location), dr (referrer) and dt (title)
// rewritten to scrubbed values. Dropped: hits from excluded pages, site-search
// hits (raw search term), and any page_view that isn't ours (no roomeo_pv
// marker), i.e. the auto page-load view and Enhanced Measurement history views,
// so only one page_view per navigation is ever sent.

const COLLECT_URL = /^https:\/\/([a-z0-9-]+\.)*(google-analytics\.com|analytics\.google\.com|doubleclick\.net)\/(g|[a-z]\/)?(collect)\b/i;

export function isCollectUrl(url: string): boolean {
  return COLLECT_URL.test(String(url || ""));
}

/** Scrub one url-encoded hit (query string or one body line). null = drop it. */
function isForeignPageView(params: URLSearchParams): boolean {
  return params.get("en") === "page_view" && !params.has(`epn.${OUR_PAGE_VIEW_PARAM}`) && !params.has(`ep.${OUR_PAGE_VIEW_PARAM}`);
}

export function scrubHitParams(qs: string, origin: string, fallbackPath = "/"): string | null {
  const params = new URLSearchParams(qs);
  if (params.get("en") === "view_search_results") return null;
  if (isForeignPageView(params)) return null;
  let path: string | null = fallbackPath;
  if (params.has("dl")) {
    const raw = params.get("dl") || "/";
    path = sanitizePagePath(raw);
    if (!path) return null;
    params.set("dl", `${origin}${path}${utmQuery(raw)}`);
  }
  if (params.has("dt") || params.has("dl")) params.set("dt", `roomeo ${path}`);
  if (params.has("dr")) {
    const ref = sanitizeReferrer(params.get("dr") || "", origin);
    if (ref) params.set("dr", ref);
    else params.delete("dr");
  }
  for (const k of [...params.keys()]) {
    if (k === "ep.search_term" || k === "ep.page_location" || k === "ep.page_referrer") params.delete(k);
  }
  return params.toString();
}

/**
 * Scrub a whole collect request. The URL's query holds shared params; a POST body
 * may hold one hit per line. Returns null when nothing is left to send.
 */
export function scrubCollectRequest(url: string, body: string | null | undefined, origin: string, currentPath: string): { url: string; body: string | null | undefined } | null {
  if (!sanitizePagePath(currentPath)) return null; // never send from /admin, /verification…
  const q = url.indexOf("?");
  const base = q >= 0 ? url.slice(0, q) : url;
  const query = q >= 0 ? url.slice(q + 1) : "";
  const fallback = sanitizePagePath(currentPath) || "/";
  const sharedDl = new URLSearchParams(query).get("dl");
  const sharedPath = sharedDl ? sanitizePagePath(sharedDl) : fallback;
  const scrubbedQuery = scrubHitParams(query, origin, fallback);
  if (scrubbedQuery === null) return null;
  const newUrl = scrubbedQuery ? `${base}?${scrubbedQuery}` : base;
  if (typeof body !== "string" || !body) return { url: newUrl, body };
  const lines = body.split("\r\n").filter(Boolean);
  const kept = lines.map((l) => scrubHitParams(l, origin, sharedPath || fallback)).filter((l): l is string => l !== null);
  if (lines.length && !kept.length) return null;
  return { url: newUrl, body: kept.join("\r\n") };
}

type GuardWindow = {
  fetch?: (input: unknown, init?: { body?: unknown } & Record<string, unknown>) => Promise<unknown>;
  navigator?: { sendBeacon?: (url: string, data?: unknown) => boolean };
  location: { pathname: string };
  Response?: new (body: null, init: { status: number }) => unknown;
  __roomeoGaGuard?: boolean;
};

/** Wrap fetch + sendBeacon once so every GA hit goes through scrubCollectRequest. */
export function installCollectGuard(win: GuardWindow, origin: string): void {
  if (win.__roomeoGaGuard) return;
  win.__roomeoGaGuard = true;
  const origFetch = win.fetch;
  if (typeof origFetch === "function") {
    win.fetch = function guardedFetch(this: unknown, input: unknown, init?: { body?: unknown } & Record<string, unknown>) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : "";
      if (url && isCollectUrl(url) && (init?.body === undefined || typeof init.body === "string")) {
        const out = scrubCollectRequest(url, init?.body as string | undefined, origin, win.location.pathname);
        if (!out) return Promise.resolve(win.Response ? new win.Response(null, { status: 204 }) : undefined);
        return origFetch.call(this, out.url, init ? { ...init, body: out.body } : init);
      }
      return origFetch.call(this, input, init);
    } as GuardWindow["fetch"];
  }
  const nav = win.navigator;
  const origBeacon = nav?.sendBeacon;
  if (nav && typeof origBeacon === "function") {
    nav.sendBeacon = function guardedBeacon(url: string, data?: unknown) {
      if (isCollectUrl(url) && (data === undefined || data === null || typeof data === "string")) {
        const out = scrubCollectRequest(url, data as string | null | undefined, origin, win.location.pathname);
        if (!out) return true;
        return origBeacon.call(nav, out.url, out.body ?? undefined);
      }
      return origBeacon.call(nav, url, data);
    };
  }
}

// ---------------------------------------------------------------------------
// Lead events (GA4 recommended event `generate_lead`). Allowed params only:
// method (whatsapp | chat | visit_request), optional listing_id (a uuid or the
// :id placeholder) and optional type (short lowercase token). Never PII.

export const LEAD_METHODS = ["whatsapp", "chat", "visit_request"] as const;
export type LeadMethod = (typeof LEAD_METHODS)[number];

export function leadParams(method: string, opts: { listingId?: string; type?: string } = {}): Record<string, string> | null {
  if (!(LEAD_METHODS as readonly string[]).includes(method)) return null;
  const out: Record<string, string> = { method };
  const id = String(opts.listingId ?? "").trim();
  if (id && (UUID.test(id) || id === ":id")) out.listing_id = id.toLowerCase();
  const type = String(opts.type ?? "").trim();
  if (/^[a-z][a-z0-9_]{0,31}$/.test(type)) out.type = type;
  return out;
}

type LeadWindow = { gtag?: Gtag; __roomeoGa4?: boolean; location?: { pathname: string } };

/**
 * Fire generate_lead if GA is running on this page (production, allowed host, not
 * an excluded page). No-op on the server, in dev, or before GA loads. Returns
 * whether an event was queued.
 */
export function sendLead(method: LeadMethod, opts: { listingId?: string; type?: string } = {}, win?: LeadWindow): boolean {
  const w = win ?? (typeof window === "undefined" ? undefined : (window as unknown as LeadWindow));
  if (!w || !w.__roomeoGa4 || typeof w.gtag !== "function") return false;
  if (!sanitizePagePath(w.location?.pathname ?? "/")) return false;
  const params = leadParams(method, opts);
  if (!params) return false;
  w.gtag("event", "generate_lead", params);
  return true;
}
