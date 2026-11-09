import test from "node:test";
import assert from "node:assert/strict";
import {
  GA_MEASUREMENT_ID,
  GA_SCRIPT_SRC,
  createPageViewTracker,
  installGtag,
  sanitizePagePath,
  sanitizeReferrer,
  shouldTrackHost,
  stripToPath,
  type Gtag,
} from "./ga4.ts";

const ORIGIN = "https://roomeo.example";
const ID = "76075a48-597e-4ac0-818f-682ff0401fc7";

test("strips query strings, hashes, hosts and stray slashes", () => {
  assert.equal(stripToPath("/search?city=Mangaluru&q=ac#top"), "/search");
  assert.equal(stripToPath("https://roomeo.example/pricing/?utm_source=x"), "/pricing");
  assert.equal(stripToPath("//saved//"), "/saved");
  assert.equal(stripToPath(""), "/");
});

test("dynamic routes become placeholders", () => {
  assert.equal(sanitizePagePath(`/listing/${ID}`), "/listing/:id");
  assert.equal(sanitizePagePath(`/listing/${ID}?ref=wa#photos`), "/listing/:id");
  assert.equal(sanitizePagePath(`/edit-listing/${ID}`), "/edit-listing/:id");
  assert.equal(sanitizePagePath("/invoice/pay_123"), "/invoice/:id");
  assert.equal(sanitizePagePath("/move-in/abcDEF123token"), "/move-in/:token");
  assert.equal(sanitizePagePath("/r/ROHITH42"), "/r/:code");
  assert.equal(sanitizePagePath("/squads/join/XYZ12"), "/squads/join/:code");
  assert.equal(sanitizePagePath(`/squads/${ID}`), "/squads/:id");
  assert.equal(sanitizePagePath("/squads"), "/squads");
});

test("static pages pass through", () => {
  for (const p of ["/", "/search", "/pricing", "/messages", "/inbox", "/dashboard", "/profile", "/create-listing"]) {
    assert.equal(sanitizePagePath(p), p);
  }
  assert.equal(sanitizePagePath("/messages?thread=" + ID), "/messages", "thread id in the query never leaks");
});

test("unknown paths still scrub ids, phones, emails and tokens", () => {
  assert.equal(sanitizePagePath(`/thing/${ID}/more`), "/thing/:id/more");
  assert.equal(sanitizePagePath("/u/someone@gmail.com"), "/u/:id");
  assert.equal(sanitizePagePath("/u/someone%40gmail.com"), "/u/:id");
  assert.equal(sanitizePagePath("/call/919380219117"), "/call/:id");
  assert.equal(sanitizePagePath("/t/aB3dE5gH7jK9mN1pQ"), "/t/:id");
});

test("admin and verification pages are never tracked", () => {
  for (const p of ["/admin", "/admin/", "/admin/users", "/ADMIN/payments?x=1", "/admin-claim", "/verification", "/verify/digilocker", "/verify/id-mock?doc=AADHAAR", "/api/og/listing/1"]) {
    assert.equal(sanitizePagePath(p), null, p);
  }
  assert.equal(sanitizePagePath("/administrator-tips"), "/administrator-tips", "only the admin area itself is excluded");
});

test("referrer: own pages scrubbed, other sites reduced to origin", () => {
  assert.equal(sanitizeReferrer(`${ORIGIN}/listing/${ID}?a=1`, ORIGIN), `${ORIGIN}/listing/:id`);
  assert.equal(sanitizeReferrer(`${ORIGIN}/admin/users`, ORIGIN), ORIGIN);
  assert.equal(sanitizeReferrer("https://www.google.com/search?q=pg+bunder", ORIGIN), "https://www.google.com");
  assert.equal(sanitizeReferrer("", ORIGIN), "");
  assert.equal(sanitizeReferrer("not a url", ORIGIN), "");
});

test("hosts: no GA on local, LAN or branch previews", () => {
  assert.equal(shouldTrackHost("roomeo.in"), true);
  assert.equal(shouldTrackHost("roomeo.vercel.app"), true);
  for (const h of ["localhost", "127.0.0.1", "192.168.1.4", "10.0.0.2", "172.20.1.1", "app.local", "roomeo-git-feat-x-team.vercel.app", ""]) {
    assert.equal(shouldTrackHost(h), false, h);
  }
});

function fakeGtag() {
  const calls: unknown[][] = [];
  const gtag: Gtag = (...args) => {
    calls.push(args);
  };
  const views = () => calls.filter((c) => c[0] === "event" && c[1] === "page_view").map((c) => c[2] as Record<string, string>);
  return { gtag, calls, views };
}

test("one page_view on load and one per navigation; repeats ignored", () => {
  const g = fakeGtag();
  const track = createPageViewTracker(g.gtag, ORIGIN, "https://www.google.com/search?q=x");
  assert.equal(track("/"), true, "initial load");
  assert.equal(track("/"), false, "StrictMode / hydration re-resolve of the same page");
  assert.equal(track(`/listing/${ID}`), true);
  assert.equal(track(`/listing/${ID}`), false, "query or hash-only change on same path");
  assert.equal(track(`/listing/d5e6e518-516a-444b-a555-372e859159b0`), true, "a different listing is a new navigation");
  assert.equal(track("/search"), true);
  assert.equal(track(`/listing/${ID}`), true, "back/forward counts once");
  const v = g.views();
  assert.equal(v.length, 5);
  assert.deepEqual(v.map((x) => x.page_path), ["/", "/listing/:id", "/listing/:id", "/search", "/listing/:id"]);
  assert.equal(v[0].page_referrer, "https://www.google.com");
  assert.equal(v[1].page_referrer, `${ORIGIN}/`);
  assert.equal(v[1].page_location, `${ORIGIN}/listing/:id`);
  for (const x of v) {
    const blob = JSON.stringify(x);
    assert.ok(!blob.includes("?") && !blob.includes("#") && !blob.includes(ID), blob);
  }
  const sets = g.calls.filter((c) => c[0] === "set");
  assert.equal(sets.length, 5, "page fields are set before each page_view");
});

test("excluded pages send nothing and don't become the next referrer", () => {
  const g = fakeGtag();
  const track = createPageViewTracker(g.gtag, ORIGIN);
  track("/admin/users");
  track("/verification");
  track("/pricing");
  const v = g.views();
  assert.equal(v.length, 1);
  assert.equal(v[0].page_path, "/pricing");
  assert.equal(v[0].page_referrer, ORIGIN);
});

test("installGtag initialises once with send_page_view false and one async script", () => {
  const appended: { async?: boolean; src?: string }[] = [];
  const win: { dataLayer?: unknown[]; gtag?: Gtag; __roomeoGa4?: boolean } = {};
  const doc = {
    head: { appendChild: (el: unknown) => appended.push(el as { async?: boolean; src?: string }) },
    createElement: () => ({}) as { async?: boolean; src?: string },
    querySelector: (sel: string) => (appended.some((s) => sel.includes(String(s.src))) ? {} : null),
  };
  const g1 = installGtag(win, doc, ORIGIN);
  const g2 = installGtag(win, doc, ORIGIN);
  assert.equal(g1, g2);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].async, true);
  assert.equal(appended[0].src, GA_SCRIPT_SRC);
  assert.equal(GA_SCRIPT_SRC, "https://www.googletagmanager.com/gtag/js?id=G-MY0R3B2T7T");
  const layer = (win.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
  assert.equal(layer.length, 2, "js + config only, no page_view from init");
  assert.equal(layer[0][0], "js");
  assert.equal(layer[1][0], "config");
  assert.equal(layer[1][1], GA_MEASUREMENT_ID);
  const cfg = layer[1][2] as Record<string, unknown>;
  assert.equal(cfg.send_page_view, false);
  assert.equal(cfg.page_location, `${ORIGIN}/`);
});
