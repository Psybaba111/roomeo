// GA4 (G-MY0R3B2T7T) helpers. Pure and DOM-free at import time, so the server
// bundle and node:test can load it. Nothing here touches `window` unless the
// caller passes it in from a client-only effect.
//
// Privacy rules (see PR notes): we only ever send a scrubbed route path such as
// /listing/:id. No query string, no hash, no ids/tokens/codes, no emails or
// phones, no user ids, no listing titles. Admin + verification pages are never
// tracked. Page views are manual (send_page_view: false) so GA's own history
// tracking must stay off in GA admin to avoid double counting.

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
export function installGtag(win: GaWindow, doc: GaDocument, origin: string): Gtag {
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
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
    // Never let GA read the raw URL / title / referrer (could hold ids or query strings).
    page_location: `${origin}/`,
    page_title: "roomeo",
    page_referrer: "",
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
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

/**
 * Returns `track(pathname)`: sends one page_view per distinct client navigation.
 * Repeats of the same pathname (StrictMode double effects, the router re-resolving
 * after hydration or an invalidate, query-only / hash-only changes) are ignored.
 * Excluded pages send nothing but still count as "where we are now".
 */
export function createPageViewTracker(gtag: Gtag, origin: string, initialReferrer = "") {
  let lastPathname: string | null = null;
  let lastLocation = "";
  return function track(rawPathname: string): boolean {
    const pathname = stripToPath(rawPathname);
    if (pathname === lastPathname) return false;
    lastPathname = pathname;
    const pagePath = sanitizePagePath(pathname);
    if (!pagePath) {
      lastLocation = origin; // don't leak an excluded page as the next referrer
      return false;
    }
    const pageLocation = `${origin}${pagePath}`;
    const pageReferrer = lastLocation || sanitizeReferrer(initialReferrer, origin);
    const params = { page_location: pageLocation, page_path: pagePath, page_title: `roomeo ${pagePath}`, page_referrer: pageReferrer };
    // `set` keeps any later automatic event on the scrubbed values too.
    gtag("set", { page_location: pageLocation, page_title: params.page_title, page_referrer: pageReferrer });
    gtag("event", "page_view", params);
    lastLocation = pageLocation;
    return true;
  };
}
