// Booking funnel events in the browser (25 Nov 2026): names, payloads, WhatsApp taps, owner decisions, handoff.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { FUNNEL_EVENTS, PIXEL_EVENT, TRACK_EVENTS, trackEvent, type TrackWindow } from "./events.ts";
import { HANDOFF_SENT_KEY, funnelContextOf, isWhatsAppHref, sendHandoff, trackOwnerDecision, trackWhatsAppClick, whatsappSource } from "./funnel.ts";

const LID = "76075a48-597e-4ac0-818f-682ff0401fc7";
function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}
function win(o: Partial<TrackWindow> = {}) {
  const ga: unknown[][] = [];
  const w: TrackWindow & { ga: unknown[][] } = { gtag: ((...a: unknown[]) => void ga.push(a)) as TrackWindow["gtag"], __roomeoGaEvents: true, location: { pathname: "/search" }, localStorage: mem(), ga, ...o };
  return w;
}
/** Minimal DOM: an <a> inside a listing wrapper. */
type FakeNode = { tag: string; attrs: Record<string, string>; parent: FakeNode | null; closest: (s: string) => FakeNode | null; getAttribute: (n: string) => string | null };
function el(attrs: Record<string, string>, parent: FakeNode | null = null, tag = "div"): FakeNode {
  const self: FakeNode = {
    tag,
    attrs,
    parent,
    getAttribute: (n) => attrs[n] ?? null,
    closest(sel) {
      const wants = (x: FakeNode) => (sel === "a[href]" ? x.tag === "a" && "href" in x.attrs : sel.split(",").some((q) => q.replace(/[[\]]/g, "") in x.attrs));
      let cur: FakeNode | null = self;
      while (cur) {
        if (wants(cur)) return cur;
        cur = cur.parent;
      }
      return null;
    },
  };
  return self;
}

describe("funnel event names and payloads", () => {
  test("all eight funnel events are trackable, each with a Pixel mapping", () => {
    assert.deepEqual([...FUNNEL_EVENTS], ["search", "listing_view", "request_submitted", "owner_responded", "request_accepted", "payment_completed", "moved_in", "whatsapp_click"]);
    for (const e of FUNNEL_EVENTS) {
      assert.ok((TRACK_EVENTS as readonly string[]).includes(e), e);
      assert.ok(PIXEL_EVENT[e]?.name, e);
    }
    for (const e of ["sign_up", "listing_created", "request_sent", "quiz_complete", "waitlist_join"]) assert.ok((TRACK_EVENTS as readonly string[]).includes(e), `kept ${e}`);
  });
  test("listing_id + city (and area / decision) are the only funnel params; nothing personal gets through", () => {
    const w = win();
    trackEvent("listing_view", { listing_id: LID.toUpperCase(), city: "Mangaluru", name: "Asha", phone: "9876543210" }, w);
    trackEvent("search", { city: "Bengaluru", area: "BTM Layout", method: "results", email: "zz@example.com" }, w);
    trackEvent("owner_responded", { listing_id: LID, city: "Mangaluru", decision: "accepted" }, w);
    assert.deepEqual(w.ga, [
      ["event", "listing_view", { listing_id: LID, city: "Mangaluru" }],
      ["event", "search", { method: "results", city: "Bengaluru", area: "BTM Layout" }],
      ["event", "owner_responded", { city: "Mangaluru", listing_id: LID, decision: "accepted" }],
    ]);
    assert.equal(w.__roomeoEventLog?.length, 3, "QA log of what was sent");
  });
  test("never from admin / verification pages (same rule as every event)", () => {
    const w = win({ location: { pathname: "/admin/funnel" } });
    assert.deepEqual(trackEvent("search", { city: "Bengaluru" }, w), { ga: false, pixel: false });
    assert.equal(w.ga.length, 0);
  });
  test("with GA events off (unset id, previews) nothing reaches GA but the QA log records the attempt", () => {
    const w = win({ __roomeoGaEvents: false });
    assert.deepEqual(trackEvent("listing_view", { listing_id: LID, city: "Mangaluru" }, w), { ga: false, pixel: false });
    assert.equal(w.ga.length, 0);
    assert.deepEqual(w.__roomeoEventLog?.[0], { name: "listing_view", params: { listing_id: LID, city: "Mangaluru" }, ga: false });
  });
});

describe("whatsapp_click", () => {
  test("WhatsApp links are recognised and labelled share / support", () => {
    assert.ok(isWhatsAppHref("https://wa.me/?text=hi"));
    assert.ok(isWhatsAppHref("https://wa.me/919380219117"));
    assert.ok(isWhatsAppHref("https://api.whatsapp.com/send?text=x"));
    assert.ok(!isWhatsAppHref("https://example.com/wa.me"));
    assert.equal(whatsappSource("https://wa.me/?text=hi"), "share");
    assert.equal(whatsappSource("https://wa.me/919380219117"), "support");
  });
  test("a tap inside a listing page carries that listing's id and city", () => {
    const page = el({ "data-funnel-listing": LID, "data-funnel-city": "Mangaluru" });
    const a = el({ href: "https://wa.me/?text=Look" }, page, "a");
    const icon = el({}, a, "svg");
    const w = win({ location: { pathname: "/listing/x" } });
    assert.equal(trackWhatsAppClick(icon, w), true);
    assert.deepEqual(w.ga[0], ["event", "whatsapp_click", { city: "Mangaluru", source: "share", listing_id: LID }]);
    assert.deepEqual(funnelContextOf(el({}, null)), {});
    assert.equal(trackWhatsAppClick(el({ href: "/pricing" }, null, "a"), w), false);
  });
});

describe("owner decisions and the server handoff", () => {
  test("first accept fires owner_responded + request_accepted; a decline only owner_responded; repeats nothing", () => {
    const w = win({ location: { pathname: "/applications" } });
    assert.deepEqual(trackOwnerDecision("ACCEPTED", { listingId: LID, city: "Mangaluru", firstReply: true }, w), ["owner_responded", "request_accepted"]);
    assert.deepEqual(trackOwnerDecision("DECLINED", { listingId: LID, city: "Mangaluru", firstReply: true }, w), ["owner_responded"]);
    assert.deepEqual(trackOwnerDecision("ACCEPTED", { listingId: LID, city: "Mangaluru", firstReply: false }, w), []);
    assert.deepEqual(trackOwnerDecision("WITHDRAWN", { listingId: LID, firstReply: true }, w), []);
    assert.equal(w.ga.length, 3);
  });
  test("payment_completed / moved_in from the server go to GA once per browser, only once GA took them", () => {
    const store = mem();
    const list = [
      { id: "e1", kind: "payment_completed", listingId: LID, city: "Mangaluru" },
      { id: "e2", kind: "moved_in", listingId: LID, city: "Mangaluru" },
      { id: "e3", kind: "request_submitted", listingId: LID, city: "Mangaluru" },
    ];
    assert.equal(sendHandoff(list, store, win({ __roomeoGaEvents: false })), 0, "GA off: nothing marked sent");
    const w = win({ location: { pathname: "/dashboard" } });
    assert.equal(sendHandoff(list, store, w), 2);
    assert.equal(sendHandoff(list, store, w), 0, "never twice");
    assert.deepEqual(JSON.parse(store.getItem(HANDOFF_SENT_KEY) ?? "[]"), ["e1", "e2"]);
    assert.deepEqual(w.ga.map((c) => c[1]), ["payment_completed", "moved_in"]);
  });
});
