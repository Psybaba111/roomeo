import { test } from "node:test";
import assert from "node:assert/strict";
import { dealWaiting, inboxBadgeCount, inboxBadgeLabel, isOwner, unreadChatCount } from "./owner-inbox.ts";

test("badge count adds requests, unread chats and payments", () => {
  assert.equal(inboxBadgeCount({ newRequests: 2, unreadChats: 3, paymentsWaiting: 1 }), 6);
  assert.equal(inboxBadgeCount({}), 0);
  assert.equal(inboxBadgeCount({ newRequests: -1, unreadChats: Number.NaN, paymentsWaiting: 1.7 }), 1);
});

test("badge label hides at zero and caps at 9+", () => {
  assert.equal(inboxBadgeLabel(0), "");
  assert.equal(inboxBadgeLabel(4), "4");
  assert.equal(inboxBadgeLabel(10), "9+");
  assert.equal(inboxBadgeLabel(Number.NaN), "");
});

test("unread chats counts threads, not messages", () => {
  assert.equal(unreadChatCount([{ unread: 5 }, { unread: 0 }, { unread: 1 }]), 2);
});

test("owner means at least one bed", () => {
  assert.equal(isOwner({ listingCount: 0 }), false);
  assert.equal(isOwner({ listingCount: 2 }), true);
});

test("deal waiting step", () => {
  const base = { issued: false, cancelled: false, ownerSigned: false, seekerSigned: true, feeStatus: "" };
  assert.equal(dealWaiting(base)?.hint, "Your turn: read it and sign ✍️");
  assert.equal(dealWaiting({ ...base, ownerSigned: true, seekerSigned: false })?.step, "Sign agreement");
  assert.equal(dealWaiting({ ...base, issued: true, feeStatus: "SUBMITTED" })?.reviewable, true);
  assert.equal(dealWaiting({ ...base, issued: true, feeStatus: "PENDING" })?.reviewable, false);
  assert.equal(dealWaiting({ ...base, issued: true, feeStatus: "PAID" }), null);
  assert.equal(dealWaiting({ ...base, cancelled: true }), null);
});
