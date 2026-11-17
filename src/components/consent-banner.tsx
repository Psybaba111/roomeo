import { useEffect, useState } from "react";
import { buildTrackingEnv, trackingConfig } from "@/lib/analytics/config";
import { CONSENT_EVENT, CONSENT_OPEN_EVENT, readConsent, shouldShowBanner, writeConsent, type ConsentChoice } from "@/lib/analytics/consent";
import { btnSmall } from "@/components/ui-tokens";

const btnSolid = (bg: string) => btnSmall.replace("border border-line bg-card", `${bg} text-card`);

/**
 * Cookie choice (DPDP-style). Client-only: renders nothing on the server or where no tracker would run
 * (localhost, dev builds), so it never shifts layout or blocks first paint. Both choices are one tap and
 * equally prominent; "Cookie settings" in the footer reopens it.
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [tracked, setTracked] = useState(false);
  useEffect(() => {
    const cfg = trackingConfig(buildTrackingEnv(), window.location.hostname);
    const on = Boolean(cfg.ga || cfg.pixel);
    setTracked(on);
    let rec = null;
    try {
      rec = readConsent(window.localStorage);
    } catch {
      /* storage blocked */
    }
    setOpen(shouldShowBanner(cfg, rec));
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);
  if (!open) return null;
  const choose = (choice: ConsentChoice) => {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      /* blocked */
    }
    const rec = writeConsent(storage, choice);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: rec }));
    setOpen(false);
  };
  return (
    <div
      role="dialog"
      aria-label="Cookie choice"
      data-testid="consent-banner"
      className="fixed inset-x-2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl rounded-2xl border border-line bg-card p-3 shadow-lg md:bottom-4"
    >
      <p className="text-sm">
        We use essential cookies to keep you signed in.{tracked ? " With your OK, we also use analytics cookies (Google Analytics) to learn which pages help people find a bed." : ""} No ad tracking
        without your OK. Change this any time under Cookie settings.{" "}
        <a href="/privacy#cookies" className="font-semibold text-brand underline-offset-4 hover:underline">
          Privacy
        </a>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className={btnSolid("bg-ink")} data-testid="consent-reject" onClick={() => choose("denied")}>
          Reject (essential only)
        </button>
        <button type="button" className={btnSolid("bg-brand")} data-testid="consent-accept" onClick={() => choose("granted")}>
          Accept
        </button>
      </div>
    </div>
  );
}

/** Footer link that reopens the banner. */
export function CookieSettingsLink({ className = "" }: { className?: string }) {
  return (
    <button type="button" className={`hover:underline ${className}`} data-testid="cookie-settings" onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}>
      Cookie settings
    </button>
  );
}
