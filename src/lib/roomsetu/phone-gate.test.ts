import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NEED_PHONE_MESSAGE, isNeedPhoneError, sendNeedsContactCheck, verifyStepCopy } from "./phone-gate.ts";

test("need-phone message matches what the server throws", () => {
  const src = readFileSync(new URL("./pricing-db.ts", import.meta.url), "utf8");
  assert.ok(src.includes(NEED_PHONE_MESSAGE));
  assert.ok(isNeedPhoneError(NEED_PHONE_MESSAGE));
  assert.ok(!isNeedPhoneError("Messaging is blocked."));
});

test("first seeker message on a listing thread needs the contact check", () => {
  const base = { listingOwnerId: "own", senderId: "me", squadThread: false, senderHasPriorMessage: false, unlocked: false };
  assert.equal(sendNeedsContactCheck(base), true);
  assert.equal(sendNeedsContactCheck({ ...base, senderId: "own" }), false, "owner replies are free");
  assert.equal(sendNeedsContactCheck({ ...base, unlocked: true }), false);
  assert.equal(sendNeedsContactCheck({ ...base, senderHasPriorMessage: true }), false);
  assert.equal(sendNeedsContactCheck({ ...base, squadThread: true }), false);
  assert.equal(sendNeedsContactCheck({ ...base, listingOwnerId: null }), false);
});

test("server still enforces: sendMessage runs the contact check before inserting", () => {
  const src = readFileSync(new URL("./account-api.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export const sendMessage"), src.indexOf("export const blockUser"));
  const check = fn.indexOf("assertContactAllowed");
  const insert = fn.indexOf("insert into messages");
  assert.ok(check > 0 && insert > check, "contact check must run before the message insert");
  const open = src.slice(src.indexOf("export const openConversation"), src.indexOf("export const listConversations"));
  assert.match(open, /isNeedPhoneError/);
});

test("verify step copy", () => {
  assert.equal(verifyStepCopy("phone").cta, "Send code");
  assert.equal(verifyStepCopy("code").cta, "Verify & send");
  assert.match(verifyStepCopy("phone").hint, /number stays hidden/);
});

test("listing no longer shows the phone wall", () => {
  const src = readFileSync(new URL("../../components/contact-gate.tsx", import.meta.url), "utf8");
  assert.match(src, /s\.access === "NEED_PHONE"\) && hideOpen\) return null/);
});
