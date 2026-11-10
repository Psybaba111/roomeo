import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CTA_LOADING, FEE_UNDER_PRICE, MESSAGE_CTA, REQUEST_CTA, REQUEST_CTA_SIGNED_OUT, ctaDisabled, isAlreadyRequested, requestCtaLabel, istStamp, requestHref, withdrawalLine, pinnedRequestFor, requestSentLine, requestStatusLabel } from "./booking-cta.ts";
import { dealSteps } from "./deal-steps.ts";

test("one CTA label, signed in and out", () => {
  assert.equal(REQUEST_CTA, "Request this bed");
  assert.equal(REQUEST_CTA_SIGNED_OUT, "Sign in to request this bed");
  assert.match(FEE_UNDER_PRICE, /₹589 one-time Roomeo fee, only after the owner says yes/);
});

test("listing page uses only the new CTA", () => {
  const src = readFileSync(new URL("../../routes/listing.$id.tsx", import.meta.url), "utf8");
  for (const old of ["Join this bed", "Chat the owner", "Sign in to chat", "Sign in to message the owner"]) assert.ok(!src.includes(old), old);
  assert.ok(src.includes("requestCtaLabel(cta)") && src.includes("FEE_UNDER_PRICE"));
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

test("pay step says both sides pay ₹589", () => {
  const base = { iSigned: true, issued: true, cancelled: false, feeOn: true, feePaid: false, feeTotal: 589, movedIn: false };
  assert.match(dealSteps({ ...base, role: "tenant" })[2].hint, /owner pays ₹589 once too/);
  assert.match(dealSteps({ ...base, role: "owner" })[2].hint, /tenant pays ₹589 once too/);
});

test("request CTA never flashes 'Sign in' while the session loads", () => {
  const base = { requesting: false, sessionPending: true, signedIn: false };
  assert.equal(requestCtaLabel(base), CTA_LOADING);
  assert.equal(requestCtaLabel(base, true), CTA_LOADING);
  assert.equal(ctaDisabled(base), true);
  assert.equal(requestCtaLabel({ ...base, sessionPending: false }), REQUEST_CTA_SIGNED_OUT);
  assert.equal(requestCtaLabel({ ...base, sessionPending: false, signedIn: true }), REQUEST_CTA);
  assert.equal(ctaDisabled({ requesting: false, sessionPending: false }), false);
  assert.equal(requestCtaLabel({ requesting: true, sessionPending: false, signedIn: true }), "Sending your request…");
  assert.equal(requestCtaLabel({ requesting: true, sessionPending: false, signedIn: true }, true), "Sending…");
  assert.equal(ctaDisabled({ requesting: true, sessionPending: false }), true);
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
