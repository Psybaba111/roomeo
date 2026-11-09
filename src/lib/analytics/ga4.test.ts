import test from "node:test";
import assert from "node:assert/strict";
import {
  GA_MEASUREMENT_ID,
  GA_SCRIPT_SRC,
  createPageViewTracker,
  initialPageFields,
  installCollectGuard,
  installGtag,
  isCollectUrl,
  scrubCollectRequest,
  scrubHitParams,
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
  assert.ok(v.every((x) => (x as Record<string, unknown>).roomeo_pv === 1), "our page_views carry the marker the guard keeps");
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

test("installGtag queues set(send_page_view:false + scrubbed fields) BEFORE js/config, once", () => {
  const appended: { async?: boolean; src?: string }[] = [];
  const win: { dataLayer?: unknown[]; gtag?: Gtag; __roomeoGa4?: boolean } = {};
  const doc = {
    head: { appendChild: (el: unknown) => appended.push(el as { async?: boolean; src?: string }) },
    createElement: () => ({}) as { async?: boolean; src?: string },
    querySelector: (sel: string) => (appended.some((s) => sel.includes(String(s.src))) ? {} : null),
  };
  const fields = initialPageFields(`/listing/${ID}`, ORIGIN, "https://www.google.com/search?q=pg");
  const g1 = installGtag(win, doc, ORIGIN, fields);
  const g2 = installGtag(win, doc, ORIGIN, fields);
  assert.equal(g1, g2);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].async, true);
  assert.equal(appended[0].src, GA_SCRIPT_SRC);
  assert.equal(GA_SCRIPT_SRC, "https://www.googletagmanager.com/gtag/js?id=G-MY0R3B2T7T");
  const layer = (win.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
  assert.deepEqual(layer.map((c) => c[0]), ["set", "js", "config"], "set must come first: the auto-configured tag only honours earlier set fields");
  const set = layer[0][1] as Record<string, unknown>;
  assert.equal(set.send_page_view, false);
  assert.equal(set.page_location, `${ORIGIN}/listing/:id`);
  assert.equal(set.page_title, "roomeo /listing/:id");
  assert.equal(set.page_referrer, "https://www.google.com");
  assert.equal(layer[2][1], GA_MEASUREMENT_ID);
  const cfg = layer[2][2] as Record<string, unknown>;
  assert.equal(cfg.send_page_view, false);
  assert.equal(cfg.page_location, `${ORIGIN}/listing/:id`);
  assert.ok(!JSON.stringify(layer).includes(ID), "no raw ids anywhere in the queue");
});

test("initialPageFields: excluded pages fall back to the bare origin", () => {
  assert.deepEqual(initialPageFields("/admin/users", ORIGIN, ""), { page_location: `${ORIGIN}/`, page_title: "roomeo", page_referrer: "" });
});

const RAW = `${ORIGIN}/listing/${ID}?utm_source=test`;
const enc = encodeURIComponent;

test("isCollectUrl matches GA4 endpoints only", () => {
  assert.ok(isCollectUrl("https://analytics.google.com/g/collect?v=2"));
  assert.ok(isCollectUrl("https://region1.google-analytics.com/g/collect?v=2"));
  assert.ok(isCollectUrl("https://stats.g.doubleclick.net/g/collect?v=2"));
  assert.ok(!isCollectUrl("https://www.googletagmanager.com/gtag/js?id=G-MY0R3B2T7T"));
  assert.ok(!isCollectUrl(`${ORIGIN}/api/g/collect`));
});

test("scrubHitParams rewrites raw dl/dr/dt from automatic hits", () => {
  const out = new URLSearchParams(scrubHitParams(`en=page_view&epn.roomeo_pv=1&dl=${enc(RAW)}&dr=${enc(`${ORIGIN}/pricing?utm_source=x`)}&dt=${enc("Mud Home Premium PG · 6-sharing")}&_et=5`, ORIGIN) ?? "");
  assert.equal(out.get("dl"), `${ORIGIN}/listing/:id`);
  assert.equal(out.get("dr"), `${ORIGIN}/pricing`);
  assert.equal(out.get("dt"), "roomeo /listing/:id");
  assert.equal(out.get("_et"), "5");
  const ext = new URLSearchParams(scrubHitParams(`en=scroll&dr=${enc("https://www.google.com/search?q=pg+bunder")}`, ORIGIN, "/pricing") ?? "");
  assert.equal(ext.get("dr"), "https://www.google.com");
  assert.equal(scrubHitParams(`en=view_search_results&dl=${enc(`${ORIGIN}/search?q=bunder`)}&ep.search_term=bunder`, ORIGIN), null, "site search hits carry raw terms: dropped");
  assert.equal(scrubHitParams(`en=page_view&epn.roomeo_pv=1&dl=${enc(`${ORIGIN}/admin/users`)}`, ORIGIN), null);
});

test("only our page_views survive: auto page-load and history page_views are dropped", () => {
  assert.equal(scrubHitParams(`en=page_view&dl=${enc(RAW)}&_fv=1&_ss=1`, ORIGIN), null, "Google tag auto page-load view");
  assert.equal(scrubHitParams(`en=page_view&dl=${enc(`${ORIGIN}/pricing`)}&ae=a`, ORIGIN), null, "Enhanced Measurement history view");
  assert.ok(scrubHitParams(`en=page_view&epn.roomeo_pv=1&dl=${enc(`${ORIGIN}/pricing`)}`, ORIGIN));
  assert.ok(scrubHitParams(`en=page_view&ep.roomeo_pv=1&dl=${enc(`${ORIGIN}/pricing`)}`, ORIGIN));
  assert.ok(scrubHitParams(`en=scroll&dl=${enc(`${ORIGIN}/pricing`)}`, ORIGIN), "other automatic events are kept (scrubbed)");
  assert.ok(scrubHitParams(`en=user_engagement&_et=500`, ORIGIN, "/pricing"));
});

test("scrubCollectRequest handles shared query + multi-line body and drops excluded pages", () => {
  const url = `https://analytics.google.com/g/collect?v=2&tid=G-MY0R3B2T7T&dl=${enc(RAW)}&dt=${enc("Real title")}`;
  const body = [`en=page_view&epn.roomeo_pv=1&_et=3`, `en=page_view&epn.roomeo_pv=1&dl=${enc(`${ORIGIN}/listing/e139bd64-4794-435b-a0d4-9096075e1974?q=2`)}&dr=${enc(RAW)}`, `en=view_search_results&ep.search_term=x`].join("\r\n");
  const out = scrubCollectRequest(url, body, ORIGIN, `/listing/${ID}`);
  assert.ok(out);
  const blob = decodeURIComponent(`${out.url}\n${out.body}`);
  assert.ok(!blob.includes(ID) && !blob.includes("e139bd64") && !blob.includes("utm_source") && !blob.includes("?q=2") && !blob.includes("Real title"), blob);
  assert.equal(String(out.body).split("\r\n").length, 2, "search hit removed");
  assert.equal(new URLSearchParams(out.url.split("?")[1]).get("tid"), "G-MY0R3B2T7T");
  assert.equal(scrubCollectRequest(url, body, ORIGIN, "/admin/payments"), null, "nothing leaves an excluded page");
  assert.equal(scrubCollectRequest(url, "en=view_search_results&ep.search_term=x", ORIGIN, "/search"), null);
});

test("installCollectGuard rewrites fetch + sendBeacon GA hits, passes everything else through", async () => {
  const sent: { via: string; url: string; body: unknown }[] = [];
  const win = {
    location: { pathname: `/listing/${ID}` },
    fetch: async (input: unknown, init?: { body?: unknown }) => {
      sent.push({ via: "fetch", url: String(input), body: init?.body });
      return "ok";
    },
    navigator: {
      sendBeacon: (url: string, data?: unknown) => {
        sent.push({ via: "beacon", url, body: data });
        return true;
      },
    },
    Response: class {
      status: number;
      constructor(_b: null, init: { status: number }) {
        this.status = init.status;
      }
    },
  };
  installCollectGuard(win, ORIGIN);
  installCollectGuard(win, ORIGIN); // idempotent, no double wrap
  await win.fetch(`https://analytics.google.com/g/collect?v=2&dl=${enc(RAW)}&dt=x`, { body: `en=page_view&epn.roomeo_pv=1&dr=${enc(RAW)}`, keepalive: true } as { body?: unknown });
  win.navigator.sendBeacon(`https://analytics.google.com/g/collect?v=2&dl=${enc(RAW)}`, `en=user_engagement`);
  await win.fetch(`${ORIGIN}/api/thing?id=${ID}`, { body: "x" });
  assert.equal(sent.length, 3);
  assert.ok(!decodeURIComponent(sent[0].url + sent[0].body).includes(ID));
  assert.ok(!decodeURIComponent(sent[1].url).includes(ID));
  assert.equal(sent[2].url, `${ORIGIN}/api/thing?id=${ID}`, "non-GA requests untouched");
  win.location.pathname = "/admin/users";
  const r = (await win.fetch(`https://analytics.google.com/g/collect?v=2&dl=${enc(RAW)}`, { body: "en=scroll" })) as { status?: number };
  assert.equal(r.status, 204);
  assert.equal(win.navigator.sendBeacon("https://analytics.google.com/g/collect?v=2", "en=scroll"), true);
  assert.equal(sent.length, 3, "hits from excluded pages are swallowed");
});
