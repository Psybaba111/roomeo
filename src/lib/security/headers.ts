/**
 * Security headers for every response on the deployed app (wired through Nitro `routeRules`
 * in vite.config.ts, so Vercel also applies them to static assets). Dev/live preview is untouched.
 *
 * The full CSP ships as Content-Security-Policy-Report-Only: the app relies on inline hydration
 * scripts, GA, the Meta Pixel (only after cookie Accept) and the platform extensions.js, and a strict
 * enforcing policy would risk breaking those. Only the parts that cannot break a page are enforced:
 * no framing by other sites, no <base> hijack, no plugins.
 */
const REPORT_ONLY_CSP: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://connect.facebook.net", "https://grok.com"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "font-src": ["'self'", "data:"],
  "connect-src": [
    "'self'",
    "https://www.google-analytics.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://www.googletagmanager.com",
    "https://www.facebook.com",
    "https://connect.facebook.net",
    "https://grok.com",
    "https://*.grok.com",
    "https://auth.grok.me",
  ],
  "frame-src": ["'self'", "https://www.facebook.com"],
  "media-src": ["'self'", "data:", "blob:", "https:"],
  "worker-src": ["'self'", "blob:"],
  "manifest-src": ["'self'"],
  "form-action": ["'self'", "https://auth.grok.me", "https://accounts.google.com"],
  "frame-ancestors": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
};

const ENFORCED_CSP: Record<string, string[]> = {
  "frame-ancestors": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
};

export function cspString(p: Record<string, string[]>): string {
  return Object.entries(p)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": cspString(ENFORCED_CSP),
  "Content-Security-Policy-Report-Only": cspString(REPORT_ONLY_CSP),
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
};
