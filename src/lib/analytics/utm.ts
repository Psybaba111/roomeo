/**
 * First-touch UTM capture. The first landing that carries utm_source / utm_medium / utm_campaign wins and is
 * kept in localStorage; later visits never overwrite it. Values are scrubbed with the same rules GA uses
 * (no emails, phone numbers or uuids; 100 chars max). Pure: storage is passed in.
 */
import { utmQuery } from "./ga4.ts";

export const UTM_STORAGE_KEY = "roomeo_ft_utm";
export const FIRST_TOUCH_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
export type FirstTouch = { utm_source?: string; utm_medium?: string; utm_campaign?: string; at?: string };
type Store = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };

/** Allowlisted, scrubbed first-touch keys from a URL. {} when it has none. */
export function utmFromUrl(href: string): FirstTouch {
  const q = utmQuery(href);
  if (!q) return {};
  const p = new URLSearchParams(q.slice(1));
  const out: FirstTouch = {};
  for (const k of FIRST_TOUCH_KEYS) {
    const v = p.get(k);
    if (v) out[k] = v;
  }
  return out;
}

export function readFirstTouch(store: Store | null | undefined): FirstTouch {
  if (!store) return {};
  try {
    const raw = store.getItem(UTM_STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: FirstTouch = {};
    for (const k of FIRST_TOUCH_KEYS) if (typeof o[k] === "string" && o[k]) out[k] = String(o[k]).slice(0, 100);
    if (typeof o.at === "string") out.at = o.at;
    return out;
  } catch {
    return {};
  }
}

/** Store the landing URL's UTMs if nothing is stored yet. Returns what is stored after the call. */
export function captureFirstTouch(href: string, store: Store | null | undefined, now: Date = new Date()): FirstTouch {
  const existing = readFirstTouch(store);
  if (existing.utm_source || existing.utm_medium || existing.utm_campaign) return existing;
  const fresh = utmFromUrl(href);
  if (!fresh.utm_source && !fresh.utm_medium && !fresh.utm_campaign) return existing;
  const value = { ...fresh, at: now.toISOString() };
  try {
    store?.setItem(UTM_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage full / blocked: fine, just not remembered */
  }
  return value;
}

/** Only the three utm_* keys (for event params and DB writes). */
export function utmParams(ft: FirstTouch): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  const out: { utm_source?: string; utm_medium?: string; utm_campaign?: string } = {};
  for (const k of FIRST_TOUCH_KEYS) if (ft[k]) out[k] = ft[k];
  return out;
}

/** Server-side re-check of client-sent UTMs (never trust the client): same scrub, nulls for missing. */
export function cleanUtm(input: unknown): { source: string | null; medium: string | null; campaign: string | null } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const qs = FIRST_TOUCH_KEYS.map((k) => (typeof o[k] === "string" ? `${k}=${encodeURIComponent(String(o[k]))}` : "")).filter(Boolean).join("&");
  const ft = qs ? utmFromUrl(`/?${qs}`) : {};
  return { source: ft.utm_source ?? null, medium: ft.utm_medium ?? null, campaign: ft.utm_campaign ?? null };
}
