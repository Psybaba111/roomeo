import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { createPageViewTracker, initialPageFields, installCollectGuard, installGtag, shouldTrackHost, type GaDocument, type GaWindow } from "@/lib/analytics/ga4";

// One tracker per page load, shared across remounts so StrictMode can't double count.
let tracker: ((pathname: string) => boolean) | null = null;

/**
 * GA4 page views for TanStack Router. Renders nothing. Runs only in the browser
 * (inside useEffect, so SSR never touches window), only in production builds and
 * never on localhost / LAN / Vercel branch previews.
 */
export function Ga4Analytics() {
  const router = useRouter();
  useEffect(() => {
    if (!import.meta.env.PROD || !shouldTrackHost(window.location.hostname)) return;
    const origin = window.location.origin;
    if (!tracker) {
      // Guard first so even gtag's own automatic hits (Enhanced Measurement) are scrubbed.
      installCollectGuard(window as unknown as Parameters<typeof installCollectGuard>[0], origin);
      const fields = initialPageFields(window.location.pathname + window.location.search, origin, document.referrer);
      tracker = createPageViewTracker(installGtag(window as unknown as GaWindow, document as unknown as GaDocument, origin, fields), origin, document.referrer);
    }
    const track = tracker;
    track(router.state.resolvedLocation?.href ?? window.location.pathname + window.location.search);
    // onResolved fires once per finished navigation (after redirects; preloads don't fire it).
    return router.subscribe("onResolved", (e) => {
      track(e.toLocation.href);
    });
  }, [router]);
  return null;
}
