import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { sendHandoff, trackWhatsAppClick } from "@/lib/analytics/funnel";

let clicksInstalled = false;

/**
 * Booking funnel glue that isn't tied to one page (renders nothing):
 *  - whatsapp_click for any WhatsApp link, with listing_id / city from the nearest data-funnel-* ancestor;
 *  - the signed-in person's server-logged steps (payment_completed, moved_in) sent to GA4 once from their browser.
 * Both go through trackEvent, so consent, the GA id / events switch and the admin / verification page exclusions apply.
 */
export function FunnelTracking() {
  const { user } = useCurrentUserState();
  useEffect(() => {
    if (clicksInstalled) return;
    clicksInstalled = true;
    document.addEventListener(
      "click",
      (e) => {
        try {
          trackWhatsAppClick(e.target as unknown as Parameters<typeof trackWhatsAppClick>[0]);
        } catch {
          /* never break a click for analytics */
        }
      },
      { capture: true },
    );
  }, []);
  useEffect(() => {
    if (!user || user.isDevFallback) return;
    // GA installs when the page is idle; only ask the server once events are actually on (never on previews).
    const t = window.setTimeout(() => {
      if (!(window as unknown as { __roomeoGaEvents?: boolean }).__roomeoGaEvents) return;
      void import("@/lib/roomsetu/funnel-api")
        .then(({ myFunnelHandoff }) => myFunnelHandoff())
        .then((list) => {
          let store: Storage | null = null;
          try {
            store = window.localStorage;
          } catch {
            store = null;
          }
          sendHandoff(list, store);
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearTimeout(t);
  }, [user]);
  return null;
}
