import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_KEY, analyticsGranted, gaConsentDefaults, gaConsentUpdate, parseConsent, pixelAllowed, readConsent, shouldShowBanner, writeConsent } from "./consent.ts";
import { installGtag, type GaDocument, type GaWindow } from "./ga4.ts";
import { trackingConfig } from "./config.ts";
import { PRIVACY } from "../legal.ts";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}
function fakeDoc() {
  const scripts: string[] = [];
  return { scripts, doc: { head: { appendChild: (el: { src?: string }) => scripts.push(String(el.src)) }, createElement: () => ({}), querySelector: () => null } as unknown as GaDocument };
}
const PROD = { gaId: "G-MY0R3B2T7T", pixelId: "", prodBuild: true, deployEnv: "production" };

describe("consent storage", () => {
  test("no choice → null; accept and reject are stored and read back", () => {
    const s = mem();
    assert.equal(readConsent(s), null);
    const a = writeConsent(s, "granted", new Date("2026-11-17T08:00:00Z"));
    assert.deepEqual(readConsent(s), a);
    assert.equal(JSON.parse(s.m.get(CONSENT_KEY) as string).choice, "granted");
    writeConsent(s, "denied");
    assert.equal(readConsent(s)?.choice, "denied");
    assert.equal(analyticsGranted(readConsent(s)), false);
  });
  test("corrupt or unknown values ask again; blocked storage never throws", () => {
    assert.equal(parseConsent("{"), null);
    assert.equal(parseConsent(JSON.stringify({ v: 2, choice: "granted", at: "x" })), null);
    assert.equal(parseConsent(JSON.stringify({ v: 1, choice: "maybe", at: "x" })), null);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    assert.equal(readConsent(blocked), null);
    assert.equal(writeConsent(blocked, "denied").choice, "denied");
  });
});

describe("what runs for each choice", () => {
  const rec = (choice: "granted" | "denied") => ({ v: 1 as const, choice, at: "2026-11-17T08:00:00Z" });
  test("GA Consent Mode: everything denied by default and on reject; Accept grants analytics only, never ads", () => {
    for (const r of [null, rec("denied")]) assert.deepEqual(gaConsentDefaults(r), { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" });
    const g = gaConsentDefaults(rec("granted"));
    assert.equal(g.analytics_storage, "granted");
    assert.equal(g.ad_storage, "denied");
    assert.equal(g.ad_user_data, "denied");
    assert.equal(g.ad_personalization, "denied");
    assert.deepEqual(gaConsentUpdate(rec("granted")), { analytics_storage: "granted" });
    assert.deepEqual(gaConsentUpdate(rec("denied")), { analytics_storage: "denied" });
  });
  test("Meta Pixel: only with an ID AND Accept; never with VITE_META_PIXEL_ID empty", () => {
    const pixel = { id: "123456789012345" };
    assert.equal(pixelAllowed(pixel, null), false);
    assert.equal(pixelAllowed(pixel, rec("denied")), false);
    assert.equal(pixelAllowed(pixel, rec("granted")), true);
    assert.equal(pixelAllowed(null, rec("granted")), false);
    const cfg = trackingConfig(PROD, "roomeo-eosin.vercel.app");
    assert.equal(cfg.pixel, null, "empty pixel id → no pixel config at all");
    assert.equal(pixelAllowed(cfg.pixel, rec("granted")), false);
  });
  test("banner shows on a tracked prod host with no choice; not after a choice; never on localhost", () => {
    const cfg = trackingConfig(PROD, "roomeo-eosin.vercel.app");
    assert.equal(shouldShowBanner(cfg, null), true);
    assert.equal(shouldShowBanner(cfg, rec("denied")), false);
    assert.equal(shouldShowBanner(cfg, rec("granted")), false);
    assert.equal(shouldShowBanner(trackingConfig(PROD, "localhost"), null), false);
  });
  test("installGtag queues consent default FIRST (before set/js/config), with ads redaction", () => {
    const win: GaWindow = {};
    const { doc, scripts } = fakeDoc();
    installGtag(win, doc, "https://roomeo-eosin.vercel.app", undefined, "G-MY0R3B2T7T", {}, gaConsentDefaults(null));
    const cmds = (win.dataLayer as IArguments[]).map((a) => Array.from(a));
    assert.deepEqual(cmds[0], ["consent", "default", gaConsentDefaults(null)]);
    assert.deepEqual(cmds[1], ["set", "ads_data_redaction", true]);
    const iConfig = cmds.findIndex((c) => c[0] === "config");
    assert.ok(iConfig > 1);
    assert.equal((cmds[iConfig][2] as Record<string, unknown>).allow_google_signals, false);
    assert.equal((cmds[iConfig][2] as Record<string, unknown>).allow_ad_personalization_signals, false);
    assert.equal(scripts.length, 1);
  });
  test("installGtag without consent arg is unchanged (no consent command)", () => {
    const win: GaWindow = {};
    installGtag(win, fakeDoc().doc, "https://x.test");
    assert.equal((win.dataLayer as IArguments[]).some((a) => Array.from(a)[0] === "consent"), false);
  });
  test("privacy policy explains the cookie choice", () => {
    const text = JSON.stringify(PRIVACY);
    assert.match(text, /Cookie settings/);
    assert.match(text, /Reject/);
    assert.doesNotMatch(text, /no third-party trackers/);
  });
});
