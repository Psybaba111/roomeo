/**
 * Which trackers run, decided from public build-time env (Vite exposes VITE_* only):
 *   VITE_GA_MEASUREMENT_ID  e.g. G-MY0R3B2T7T
 *   VITE_META_PIXEL_ID      e.g. 123456789012345 (digits)
 * Pure, so node:test can cover every branch.
 *
 * GA4 has been live on prod since PR #65 with G-MY0R3B2T7T hard-coded (page views + generate_lead only).
 * To keep prod byte-for-byte the same until someone sets the var:
 *   - GA var unset/empty  -> exactly today: legacy G-MY0R3B2T7T page views on production hosts, no new events.
 *   - GA var "off"        -> no GA at all.
 *   - GA var = a G- id    -> that id, page views + the conversion events (sign_up, listing_created, …).
 *                            Vercel branch previews are allowed too, tagged traffic_type=internal + debug_mode.
 *   - Pixel var empty     -> no Pixel code runs, nothing is loaded.
 * Nothing ever runs in dev builds, on localhost / LAN, or (for previews) without an explicit GA id.
 */
import { GA_MEASUREMENT_ID, shouldTrackHost } from "./ga4.ts";

export type TrackingEnv = { gaId?: string; pixelId?: string; prodBuild: boolean; deployEnv?: string };
export type TrackingConfig = {
  ga: null | { id: string; events: boolean; internal: boolean };
  pixel: null | { id: string };
};
export const TRACKING_OFF: TrackingConfig = { ga: null, pixel: null };

const GA_ID = /^G-[A-Z0-9]{4,20}$/;
const PIXEL_ID = /^\d{8,20}$/;

/** A Vercel branch preview alias (roomeo-git-<branch>-<team>.vercel.app). */
export function isBranchPreviewHost(hostname: string): boolean {
  const h = String(hostname || "").toLowerCase();
  return h.endsWith(".vercel.app") && h.includes("-git-");
}

export function trackingConfig(env: TrackingEnv, hostname: string): TrackingConfig {
  if (!env.prodBuild) return TRACKING_OFF;
  const branchPreview = isBranchPreviewHost(hostname);
  const prodHost = shouldTrackHost(hostname); // false on localhost / LAN / branch previews (unchanged rule)
  if (!prodHost && !branchPreview) return TRACKING_OFF;
  // Built for a Vercel Preview deployment, or opened on a branch-preview alias: test traffic.
  const internal = branchPreview || String(env.deployEnv ?? "").trim().toLowerCase() === "preview";
  const rawGa = String(env.gaId ?? "").trim();
  const rawPixel = String(env.pixelId ?? "").trim();
  let ga: TrackingConfig["ga"] = null;
  if (!rawGa) {
    // Unset: exactly today's behaviour (legacy id, page views only, never on branch previews).
    if (prodHost) ga = { id: GA_MEASUREMENT_ID, events: false, internal: false };
  } else if (GA_ID.test(rawGa.toUpperCase())) {
    ga = { id: rawGa.toUpperCase(), events: true, internal };
  }
  // The Pixel has no debug / internal-traffic mode, so it never runs on preview builds or hosts.
  const pixel = !internal && prodHost && PIXEL_ID.test(rawPixel) ? { id: rawPixel } : null;
  return { ga, pixel };
}

/** Read from Vite at build time (VITE_ROOMEO_DEPLOY_ENV is injected by vite.config.ts from VERCEL_ENV). */
export function buildTrackingEnv(): TrackingEnv {
  const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env ?? {};
  return {
    gaId: String(env.VITE_GA_MEASUREMENT_ID ?? ""),
    pixelId: String(env.VITE_META_PIXEL_ID ?? ""),
    prodBuild: env.PROD === true,
    deployEnv: String(env.VITE_ROOMEO_DEPLOY_ENV ?? ""),
  };
}
