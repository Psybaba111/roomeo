// Cookie / tracking consent (DPDP-style: a clear choice, stored, changeable any time).
// Pure and DOM-free at import time; callers pass storage / window from client-only code.
//
// What each choice means:
// - No choice yet, or "Reject" (essential only): sign-in cookies only. GA4 runs in Consent Mode with every
//   storage type denied, so it sets no cookies and sends only cookieless, anonymous pings (no client id).
//   The Meta Pixel never loads.
// - "Accept": GA4 analytics cookies allowed (ad storage, ad user data and ad personalisation stay denied;
//   Google signals and ad personalisation stay off). The Meta Pixel loads only if VITE_META_PIXEL_ID is set.
// First-touch UTM capture stays on either way: it's first-party attribution kept in this browser and saved only
// with a signup, never sent to a third party.

export const CONSENT_KEY = "roomeo_consent_v1";
/** Fired on window after a choice is saved (detail: ConsentRecord). */
export const CONSENT_EVENT = "roomeo:consent";
/** Fired on window to reopen the banner (footer "Cookie settings"). */
export const CONSENT_OPEN_EVENT = "roomeo:consent-open";

export type ConsentChoice = "granted" | "denied";
export type ConsentRecord = { v: 1; choice: ConsentChoice; at: string };
export type ConsentStorage = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };

export function parseConsent(raw: string | null | undefined): ConsentRecord | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<ConsentRecord>;
    if (o && o.v === 1 && (o.choice === "granted" || o.choice === "denied") && typeof o.at === "string") return { v: 1, choice: o.choice, at: o.at };
  } catch {
    /* corrupt value: ask again */
  }
  return null;
}

export function readConsent(storage: ConsentStorage | null | undefined): ConsentRecord | null {
  try {
    return parseConsent(storage?.getItem(CONSENT_KEY));
  } catch {
    return null; // storage blocked
  }
}

export function writeConsent(storage: ConsentStorage | null | undefined, choice: ConsentChoice, now: Date = new Date()): ConsentRecord {
  const rec: ConsentRecord = { v: 1, choice, at: now.toISOString() };
  try {
    storage?.setItem(CONSENT_KEY, JSON.stringify(rec));
  } catch {
    /* storage blocked: the choice holds for this page only */
  }
  return rec;
}

export function analyticsGranted(rec: ConsentRecord | null): boolean {
  return rec?.choice === "granted";
}

/** Google Consent Mode v2 defaults, set before GA loads. Ads signals are always denied (we run no Google Ads). */
export function gaConsentDefaults(rec: ConsentRecord | null): Record<string, "granted" | "denied"> {
  return {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: analyticsGranted(rec) ? "granted" : "denied",
  };
}

export function gaConsentUpdate(rec: ConsentRecord | null): Record<string, "granted" | "denied"> {
  return { analytics_storage: analyticsGranted(rec) ? "granted" : "denied" };
}

/** The Meta Pixel may load only with an ID configured AND an explicit Accept. */
export function pixelAllowed(pixel: { id: string } | null, rec: ConsentRecord | null): boolean {
  return Boolean(pixel?.id) && analyticsGranted(rec);
}

/** Show the banner only when this build/host would run a tracker and no valid choice is stored. */
export function shouldShowBanner(cfg: { ga: unknown; pixel: unknown }, rec: ConsentRecord | null): boolean {
  return Boolean(cfg.ga || cfg.pixel) && !rec;
}
