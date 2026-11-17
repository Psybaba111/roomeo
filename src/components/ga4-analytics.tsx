import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { createPageViewTracker, initialPageFields, installCollectGuard, installGtag, sanitizePagePath, type GaDocument, type GaWindow } from "@/lib/analytics/ga4";
import { buildTrackingEnv, trackingConfig } from "@/lib/analytics/config";
import { installPixel, type PixelDocument, type PixelWindow } from "@/lib/analytics/pixel";
import { captureFirstTouch } from "@/lib/analytics/utm";

// One tracker per page load, shared across remounts so StrictMode can't double count.
let tracker: ((pathname: string) => boolean) | null = null;
let pixelTrack: ((href: string) => void) | null = null;
let started = false;
const pending: string[] = [];

/** Run after the page has loaded and the main thread is idle, so tag scripts never compete with first paint. */
function whenIdle(fn: () => void) {
  const go = () => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(fn, { timeout: 3000 });
    else window.setTimeout(fn, 1200);
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}

/**
 * GA4 + Meta Pixel page views for TanStack Router, and first-touch UTM capture. Renders nothing. Browser only
 * (inside useEffect), production builds only, and only what config.ts allows for this host and env:
 * with VITE_GA_MEASUREMENT_ID / VITE_META_PIXEL_ID unset this is exactly the pre-existing GA4 behaviour.
 */
export function Ga4Analytics() {
  const router = useRouter();
  useEffect(() => {
    try {
      captureFirstTouch(window.location.href, window.localStorage);
    } catch {
      /* storage blocked */
    }
    const cfg = trackingConfig(buildTrackingEnv(), window.location.hostname);
    if (!cfg.ga && !cfg.pixel) return;
    const send = (href: string) => {
      if (!tracker && !pixelTrack) {
        pending.push(href);
        return;
      }
      tracker?.(href);
      pixelTrack?.(href);
    };
    if (!started) {
      started = true;
      const origin = window.location.origin;
      const referrer = document.referrer;
      const firstHref = window.location.pathname + window.location.search;
      whenIdle(() => {
        if (cfg.ga) {
          // Guard first so even gtag's own automatic hits (Enhanced Measurement) are scrubbed.
          installCollectGuard(window as unknown as Parameters<typeof installCollectGuard>[0], origin);
          const extra = cfg.ga.internal ? { traffic_type: "internal", debug_mode: true } : {};
          const gtag = installGtag(window as unknown as GaWindow, document as unknown as GaDocument, origin, initialPageFields(firstHref, origin, referrer), cfg.ga.id, extra);
          tracker = createPageViewTracker(gtag, origin, referrer);
          (window as unknown as { __roomeoGaEvents?: boolean }).__roomeoGaEvents = cfg.ga.events;
        }
        if (cfg.pixel) {
          const fbq = installPixel(window as unknown as PixelWindow, document as unknown as PixelDocument, cfg.pixel.id);
          let last = "";
          pixelTrack = (href: string) => {
            const path = sanitizePagePath(href);
            if (!path || path === last) return;
            last = path;
            fbq("track", "PageView");
          };
        }
        const queued = pending.splice(0);
        for (const h of queued.length ? queued : [firstHref]) send(h);
      });
    }
    send(router.state.resolvedLocation?.href ?? window.location.pathname + window.location.search);
    // onResolved fires once per finished navigation (after redirects; preloads don't fire it).
    return router.subscribe("onResolved", (e) => {
      send(e.toLocation.href);
    });
  }, [router]);
  return null;
}
