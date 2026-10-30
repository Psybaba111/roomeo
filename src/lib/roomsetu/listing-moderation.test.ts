import test from "node:test";
import assert from "node:assert/strict";
import { auditAction, moderationBlock, type ModerationInput } from "./listing-moderation.ts";

const base: ModerationInput = { action: "verify", actorIsOwner: false, actorIsSuperAdmin: false, reason: "", listingStatus: "PAUSED", ownerCanPublish: true };

test("other admin can verify a paused listing (pause doesn't block verify)", () => {
  assert.equal(moderationBlock(base), "");
});
test("owner who is plain admin can't self-verify; super admin needs a reason", () => {
  assert.match(moderationBlock({ ...base, actorIsOwner: true }), /Another operator/);
  assert.match(moderationBlock({ ...base, actorIsOwner: true, actorIsSuperAdmin: true }), /reason/);
  assert.equal(moderationBlock({ ...base, actorIsOwner: true, actorIsSuperAdmin: true, reason: "Founder's own PG, checked on site" }), "");
  assert.equal(auditAction({ action: "verify", actorIsOwner: true }), "LISTING_SELF_VERIFY");
  assert.equal(auditAction({ action: "verify", actorIsOwner: false }), "verify");
});
test("activate needs the owner publishable and not removed; pause/activate are idempotent with a reason", () => {
  assert.match(moderationBlock({ ...base, action: "activate", ownerCanPublish: false }), /phone and ID/);
  assert.equal(moderationBlock({ ...base, action: "activate" }), "");
  assert.match(moderationBlock({ ...base, action: "activate", listingStatus: "REMOVED" }), /Restore/);
  assert.match(moderationBlock({ ...base, action: "pause" }), /Already paused/);
  assert.match(moderationBlock({ ...base, action: "activate", listingStatus: "ACTIVE" }), /Already live/);
  assert.equal(moderationBlock({ ...base, action: "pause", listingStatus: "ACTIVE", actorIsOwner: true }), "");
});
