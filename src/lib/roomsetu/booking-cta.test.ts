import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MESSAGE_CTA, requestFeeNote, viewerSignedIn, REQUEST_CTA, REQUEST_CTA_SIGNED_OUT, ctaDisabled, isAlreadyRequested, requestCtaLabel, istStamp, requestHref, withdrawalLine, pinnedRequestFor, requestSentLine, requestStatusLabel } from "./booking-cta.ts";
import { dealSteps } from "./deal-steps.ts";
import { FEE_OFF, feeUnderPrice } from "./fee-copy.ts";

test("one CTA label, signed in and out", () => {
  assert.equal(REQUEST_CTA, "Request this bed");
  assert.equal(REQUEST_CTA_SIGNED_OUT, "Sign in to request this bed");
  assert.match(feeUnderPrice({ on: true, baseInr: 499, totalInr: 589 }), /₹589 one-time Roomeo fee, only after the owner says yes/);
  assert.doesNotMatch(feeUnderPrice(FEE_OFF), /₹\d/);
});

test("listing page uses only the new CTA", () => {
  const src = readFileSync(new URL("../../routes/listing.$id.tsx", import.meta.url), "utf8");
  for (const old of ["Join this bed", "Chat the owner", "Sign in to chat", "Sign in to message the owner"]) assert.ok(!src.includes(old), old);
  assert.ok(src.includes("requestCtaLabel(cta)") && src.includes("feeUnderPrice("));
});

test("already requested is not an error for the CTA", () => {
  assert.ok(isAlreadyRequested("You already have a request on this room."));
  assert.ok(!isAlreadyRequested("That room is not taking requests."));
});

test("request sent line explains a closed chat", () => {
  assert.match(requestSentLine(""), /^Request sent 🎉/);
  assert.match(requestSentLine("Verify your phone"), /Chat isn't open yet: Verify your phone/);
});

test("pinned request matches listing and the other person", () => {
  const apps = [
    { id: "a", listingId: "L1", seekerId: "me", hostId: "own", status: "WITHDRAWN", mine: true },
    { id: "b", listingId: "L1", seekerId: "me", hostId: "own", status: "PENDING", mine: true },
    { id: "c", listingId: "L2", seekerId: "me", hostId: "own", status: "ACCEPTED", mine: true },
    { id: "d", listingId: "L1", seekerId: "s2", hostId: "me", status: "PENDING", mine: false },
  ];
  assert.equal(pinnedRequestFor(apps, { listingId: "L1", otherId: "own" })?.id, "b");
  assert.equal(pinnedRequestFor(apps, { listingId: "L1", otherId: "s2" })?.id, "d");
  assert.equal(pinnedRequestFor(apps, { listingId: "", otherId: "own" }), null);
  assert.equal(pinnedRequestFor(apps, undefined), null);
});

test("status labels", () => {
  assert.match(requestStatusLabel("PENDING", true), /Waiting on the owner/);
  assert.match(requestStatusLabel("PENDING", false), /your call/);
});

test("pay step says both sides pay ₹499 all-in (a pre-17-Nov ₹589 row keeps its wording)", () => {
  const base = { iSigned: true, issued: true, cancelled: false, feeOn: true, feePaid: false, feeTotal: 499, movedIn: false };
  assert.match(dealSteps({ ...base, role: "tenant" })[2].hint, /You pay ₹499 once \(18% GST included\).*owner pays ₹499 once too/);
  assert.match(dealSteps({ ...base, role: "owner" })[2].hint, /tenant pays ₹499 once too/);
  assert.match(dealSteps({ ...base, feeTotal: 400, role: "tenant" })[2].hint, /₹400 once \(₹499 incl\. 18% GST, less your ₹99 trial credit/);
  assert.match(dealSteps({ ...base, feeTotal: 589, role: "tenant" })[2].hint, /₹589 once \(₹499 \+ 18% GST = ₹589\).*owner pays ₹589 once too/);
});

test("request CTA is right on first paint: server viewer first, no Loading label (QA Q3)", () => {
  // Session still resolving on the client: trust the loader's viewer, signed in or out.
  assert.equal(viewerSignedIn(true, { isPending: true, signedIn: false }), true);
  assert.equal(viewerSignedIn(false, { isPending: true, signedIn: false }), false);
  // Once loaded, the client session wins (signed out in another tab, or signed in since).
  assert.equal(viewerSignedIn(true, { isPending: false, signedIn: false }), false);
  assert.equal(viewerSignedIn(false, { isPending: false, signedIn: true }), true);
  assert.equal(requestCtaLabel({ requesting: false, signedIn: true }), REQUEST_CTA);
  assert.equal(requestCtaLabel({ requesting: false, signedIn: false }), REQUEST_CTA_SIGNED_OUT);
  assert.equal(ctaDisabled({ requesting: false }), false);
  assert.equal(requestCtaLabel({ requesting: true, signedIn: true }), "Sending your request…");
  assert.equal(requestCtaLabel({ requesting: true, signedIn: true }, true), "Sending…");
  assert.equal(ctaDisabled({ requesting: true }), true);
  const src = readFileSync(new URL("../../routes/listing.$id.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("viewerSignedIn(Boolean(room.viewer?.signedIn)"), "listing seeds the CTA from the loader");
  assert.ok(!src.includes("Loading…") && !src.includes("animate-pulse"), "no loading label or pulsing CTA");
  const api = readFileSync(new URL("./public-api.ts", import.meta.url), "utf8");
  assert.ok(api.includes("viewer: { signedIn: Boolean(context.userId), isOwner }"), "getListing returns the viewer (booleans only)");
});

test("fee note next to every Request this bed follows the tenant fee flag (QA Q11)", () => {
  assert.equal(requestFeeNote({ on: true, totalInr: 499 }), "Free to request. ₹499 Roomeo fee (GST included), charged only after the owner says yes");
  assert.equal(requestFeeNote({ on: true, totalInr: 499 }, true), "₹499 only if the owner says yes");
  assert.doesNotMatch(requestFeeNote({ on: false, totalInr: 0 }), /₹\d/);
  assert.doesNotMatch(requestFeeNote({ on: false, totalInr: 0 }, true), /₹\d/);
  const src = readFileSync(new URL("../../routes/listing.$id.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("requestFeeNote(feeView)") && src.includes("requestFeeNote(feeView, true)"), "desktop and sticky bar both show it");
  assert.ok(!src.includes("Free to request. Opens a chat"), "old hard-coded line gone");
  for (const f of ["../../routes/messages.tsx", "../../routes/applications.tsx"]) {
    const page = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(page.includes("Request this bed"), f);
    assert.ok(!/Connect with the host|Message the owner · Free/.test(page), f);
  }
});

test("/applications shows one skeleton from session check to rows (no 'Checking your session…')", () => {
  const src = readFileSync(new URL("../../routes/applications.tsx", import.meta.url), "utf8");
  assert.ok(src.includes('<NeedAccount next="/applications" loading={<AppsLoading />}>'));
});

test("listing page has a secondary 'Message the owner' next to the request CTA", () => {
  const src = readFileSync(new URL("../../routes/listing.$id.tsx", import.meta.url), "utf8");
  assert.equal(MESSAGE_CTA, "Message the owner");
  assert.ok(src.includes('data-testid="message-owner-secondary"') && src.includes("MESSAGE_CTA"));
  assert.ok(src.includes("requestCtaLabel(cta)") && src.includes("requestCtaLabel(cta, true)"));
  // Opening a chat must not send a bed request.
  const fn = src.slice(src.indexOf("function messageOwner"), src.indexOf("function requestBed"));
  assert.ok(fn.includes("openConversation") && !fn.includes("applyToListing"));
});

test("withdrawal history: who withdrew and when (IST)", () => {
  assert.equal(istStamp("2026-11-09T09:35:00Z"), "9 Nov 2026, 3:05 PM IST");
  assert.equal(istStamp("2026-11-09T19:00:00Z"), "10 Nov 2026, 12:30 AM IST");
  assert.equal(istStamp("nope"), "");
  const base = { status: "WITHDRAWN", seekerName: "ZZ TEST Renter", updatedAt: "2026-11-09T09:35:00Z" };
  assert.equal(withdrawalLine({ ...base, mine: true }), "You withdrew this request · 9 Nov 2026, 3:05 PM IST");
  assert.equal(withdrawalLine({ ...base, mine: false }), "ZZ TEST Renter withdrew this request · 9 Nov 2026, 3:05 PM IST");
  assert.equal(withdrawalLine({ ...base, mine: false, seekerName: " " , updatedAt: "" }), "The renter withdrew this request");
  assert.equal(withdrawalLine({ ...base, status: "PENDING", mine: true }), "");
  assert.equal(requestHref("a b"), "/applications#req-a%20b");
});

test("dashboard requests are tappable and show withdrawal history", () => {
  const src = readFileSync(new URL("../../routes/dashboard.tsx", import.meta.url), "utf8");
  assert.ok(src.includes('data-testid="desk-request"') && src.includes("onClick={onOpen}"));
  assert.ok(src.includes("withdrawalLine(row)") && src.includes('data-testid="desk-request-history"'));
  const api = readFileSync(new URL("./account-api.ts", import.meta.url), "utf8");
  assert.match(api, /as updated_iso/);
  assert.match(api, /WITHDRAWN" && row\.seeker_id !== context\.userId/, "only the seeker can withdraw, so 'who' is the seeker");
});
