// Bengaluru Phase 0 (17 Nov 2026): GA4 + Meta Pixel config, event firing, first-touch UTM.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { trackingConfig, TRACKING_OFF, isBranchPreviewHost } from "./config.ts";
import { GA_MEASUREMENT_ID } from "./ga4.ts";
import { trackEvent, eventParams, PIXEL_EVENT, type TrackWindow } from "./events.ts";
import { captureFirstTouch, readFirstTouch, utmFromUrl, cleanUtm, UTM_STORAGE_KEY } from "./utm.ts";
import { installPixel, PIXEL_SCRIPT_SRC } from "./pixel.ts";

const PROD = "roomeo.in";
const PREVIEW = "roomeo-git-feat-blr-phase0-psybaba111s-projects.vercel.app";

describe("tracking config: empty env is a no-op (prod unchanged)", () => {
  test("no GA / Pixel env on the prod host → exactly today's GA (legacy id, page views only), no Pixel", () => {
    assert.deepEqual(trackingConfig({ prodBuild: true }, PROD), { ga: { id: GA_MEASUREMENT_ID, events: false, internal: false }, pixel: null });
    assert.deepEqual(trackingConfig({ prodBuild: true, gaId: "", pixelId: "  " }, PROD).pixel, null);
    assert.deepEqual(trackingConfig({ prodBuild: true, deployEnv: "production" }, PROD).ga, { id: GA_MEASUREMENT_ID, events: false, internal: false });
    assert.equal(trackingConfig({ prodBuild: true, deployEnv: "preview" }, "roomeo-abc123-psybaba111s-projects.vercel.app").ga?.internal, true, "preview hash URLs are tagged internal");
  });
  test("dev builds, localhost and branch previews without the env load nothing", () => {
    assert.deepEqual(trackingConfig({ prodBuild: false, gaId: "G-MY0R3B2T7T", pixelId: "123456789012345" }, PROD), TRACKING_OFF);
    assert.deepEqual(trackingConfig({ prodBuild: true, gaId: "G-MY0R3B2T7T" }, "localhost"), TRACKING_OFF);
    assert.deepEqual(trackingConfig({ prodBuild: true }, PREVIEW), TRACKING_OFF);
  });
  test("GA id set → events on; preview builds/hosts are tagged internal; junk ids are ignored", () => {
    assert.deepEqual(trackingConfig({ prodBuild: true, gaId: "G-MY0R3B2T7T" }, PROD).ga, { id: "G-MY0R3B2T7T", events: true, internal: false });
    assert.deepEqual(trackingConfig({ prodBuild: true, gaId: "G-MY0R3B2T7T", deployEnv: "preview" }, PREVIEW).ga, { id: "G-MY0R3B2T7T", events: true, internal: true });
    assert.equal(trackingConfig({ prodBuild: true, gaId: "G-MY0R3B2T7T", deployEnv: "preview" }, "roomeo-abc123-psybaba111s-projects.vercel.app").ga?.internal, true);
    assert.equal(trackingConfig({ prodBuild: true, gaId: "off" }, PROD).ga, null);
    assert.equal(isBranchPreviewHost(PREVIEW), true);
    assert.equal(isBranchPreviewHost(PROD), false);
  });
  test("Pixel only with a numeric id, on prod hosts, never on previews", () => {
    assert.deepEqual(trackingConfig({ prodBuild: true, pixelId: "123456789012345" }, PROD).pixel, { id: "123456789012345" });
    assert.equal(trackingConfig({ prodBuild: true, pixelId: "abc" }, PROD).pixel, null);
    assert.equal(trackingConfig({ prodBuild: true, pixelId: "123456789012345", deployEnv: "preview" }, PROD).pixel, null);
    assert.equal(trackingConfig({ prodBuild: true, gaId: "G-MY0R3B2T7T", pixelId: "123456789012345" }, PREVIEW).pixel, null);
  });
});

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("first-touch UTM", () => {
  test("first touch wins; later visits never overwrite it", () => {
    const s = memStore();
    const now = new Date("2026-11-17T06:30:00Z");
    assert.deepEqual(captureFirstTouch("https://roomeo.in/?utm_source=instagram&utm_medium=paid&utm_campaign=blr_launch&fbclid=x", s, now), { utm_source: "instagram", utm_medium: "paid", utm_campaign: "blr_launch", at: now.toISOString() });
    captureFirstTouch("https://roomeo.in/?utm_source=google&utm_medium=cpc", s);
    assert.equal(readFirstTouch(s).utm_source, "instagram");
    assert.equal(readFirstTouch(s).utm_campaign, "blr_launch");
  });
  test("no UTMs → nothing stored; non-utm keys never kept; broken storage is ignored", () => {
    const s = memStore();
    captureFirstTouch("https://roomeo.in/search?city=Bengaluru&gclid=abc", s);
    assert.equal(s.m.has(UTM_STORAGE_KEY), false);
    assert.deepEqual(Object.keys(utmFromUrl("https://roomeo.in/?utm_source=a&utm_term=t&email=x@example.com")), ["utm_source"]);
    assert.deepEqual(readFirstTouch(memStore({ [UTM_STORAGE_KEY]: "{not json" })), {});
    assert.doesNotThrow(() => captureFirstTouch("/?utm_source=a", { getItem: () => null, setItem: () => { throw new Error("full"); } }));
  });
  test("server re-check: cleanUtm keeps only the three keys and nulls the rest", () => {
    assert.deepEqual(cleanUtm({ utm_source: "instagram", utm_medium: "paid", utm_campaign: "blr_launch", evil: "x" }), { source: "instagram", medium: "paid", campaign: "blr_launch" });
    assert.deepEqual(cleanUtm(null), { source: null, medium: null, campaign: null });
    assert.deepEqual(cleanUtm({ utm_source: 42 }), { source: null, medium: null, campaign: null });
  });
});

function fakeWin(o: Partial<TrackWindow> = {}): TrackWindow & { gaCalls: unknown[][]; fbCalls: unknown[][] } {
  const gaCalls: unknown[][] = [];
  const fbCalls: unknown[][] = [];
  return {
    gtag: ((...a: unknown[]) => void gaCalls.push(a)) as TrackWindow["gtag"],
    fbq: ((...a: unknown[]) => void fbCalls.push(a)) as TrackWindow["fbq"],
    location: { pathname: "/" },
    localStorage: memStore({ [UTM_STORAGE_KEY]: JSON.stringify({ utm_source: "instagram", utm_medium: "paid", utm_campaign: "blr_launch" }) }),
    gaCalls,
    fbCalls,
    ...o,
  };
}

describe("events", () => {
  test("nothing fires while the trackers aren't installed (env empty)", () => {
    const w = fakeWin();
    assert.deepEqual(trackEvent("sign_up", { method: "email" }, w), { ga: false, pixel: false });
    assert.equal(w.gaCalls.length + w.fbCalls.length, 0);
    assert.deepEqual(trackEvent("sign_up", {}, undefined), { ga: false, pixel: false }); // no window (SSR)
  });
  test("each event fires to GA and the Pixel with allowlisted params plus first-touch UTM", () => {
    const names = ["sign_up", "listing_created", "request_sent", "quiz_complete", "waitlist_join"] as const;
    for (const name of names) {
      const w = fakeWin({ __roomeoGaEvents: true, __roomeoPixel: "123456789012345" });
      const out = trackEvent(name, { city: "Bengaluru", role: "tenant", email: "zz@example.com", phone: "9845012345", listing_id: "not-a-uuid" }, w);
      assert.deepEqual(out, { ga: true, pixel: true }, name);
      assert.deepEqual(w.gaCalls[0], ["event", name, { role: "tenant", city: "Bengaluru", utm_source: "instagram", utm_medium: "paid", utm_campaign: "blr_launch" }]);
      assert.deepEqual(w.fbCalls[0], [PIXEL_EVENT[name].method, PIXEL_EVENT[name].name, { role: "tenant", city: "Bengaluru", utm_source: "instagram", utm_medium: "paid", utm_campaign: "blr_launch" }]);
    }
    assert.deepEqual(PIXEL_EVENT.sign_up, { method: "track", name: "CompleteRegistration" });
    assert.deepEqual(PIXEL_EVENT.waitlist_join, { method: "track", name: "Lead" });
  });
  test("never fires from admin / verification pages; unknown names are dropped; PII never passes", () => {
    const w = fakeWin({ __roomeoGaEvents: true, location: { pathname: "/admin/payments" } });
    assert.deepEqual(trackEvent("sign_up", {}, w), { ga: false, pixel: false });
    assert.deepEqual(trackEvent("purchase" as never, {}, fakeWin({ __roomeoGaEvents: true })), { ga: false, pixel: false });
    assert.deepEqual(eventParams({ email: "a@example.com", name: "ZZ TEST", method: "Email Signup", listing_id: "8f14e45f-ceea-467a-9575-1e5c9e2b1a3d" }), { listing_id: "8f14e45f-ceea-467a-9575-1e5c9e2b1a3d" });
  });
  test("a throwing tracker never breaks the page", () => {
    const w = fakeWin({ __roomeoGaEvents: true, gtag: (() => { throw new Error("blocked"); }) as TrackWindow["gtag"] });
    assert.doesNotThrow(() => trackEvent("quiz_complete", {}, w));
  });
});

test("Pixel installs once, no auto PageView, loads fbevents.js once", () => {
  const appended: { src?: string }[] = [];
  const doc = { head: { appendChild: (el: unknown) => appended.push(el as { src?: string }) }, createElement: () => ({}), querySelector: (sel: string) => (appended.some((a) => sel.includes(String(a.src))) ? {} : null) };
  const win: Parameters<typeof installPixel>[0] = {};
  installPixel(win, doc, "123456789012345");
  installPixel(win, doc, "123456789012345");
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, PIXEL_SCRIPT_SRC);
  const q = (win.fbq?.queue ?? []) as unknown[][];
  assert.deepEqual(q.map((a) => a[0]), ["set", "init"]);
  assert.equal(win.__roomeoPixel, "123456789012345");
});
