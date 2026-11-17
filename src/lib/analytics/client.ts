// Browser-only conveniences for components. Safe to import anywhere: every call guards `window`.
import { readFirstTouch, utmParams } from "./utm.ts";
export { flushPendingEvents, queueEventForNextPage, trackEvent } from "./events.ts";

/** The stored first-touch utm_* (for passing to server functions that save attribution). */
export function currentUtm(): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  if (typeof window === "undefined") return {};
  try {
    return utmParams(readFirstTouch(window.localStorage));
  } catch {
    return {};
  }
}
