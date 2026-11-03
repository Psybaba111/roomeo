import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FEE_UNDER_PRICE, REQUEST_CTA, REQUEST_CTA_SIGNED_OUT, isAlreadyRequested, pinnedRequestFor, requestSentLine, requestStatusLabel } from "./booking-cta.ts";
import { dealSteps } from "./deal-steps.ts";

test("one CTA label, signed in and out", () => {
  assert.equal(REQUEST_CTA, "Request this bed");
  assert.equal(REQUEST_CTA_SIGNED_OUT, "Sign in to request this bed");
  assert.match(FEE_UNDER_PRICE, /₹589 one-time Roomeo fee, only after the owner says yes/);
});

test("listing page uses only the new CTA", () => {
  const src = readFileSync(new URL("../../routes/listing.$id.tsx", import.meta.url), "utf8");
  for (const old of ["Join this bed", "Chat the owner", "Sign in to chat", "Sign in to message the owner"]) assert.ok(!src.includes(old), old);
  assert.ok(src.includes("REQUEST_CTA") && src.includes("FEE_UNDER_PRICE"));
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
