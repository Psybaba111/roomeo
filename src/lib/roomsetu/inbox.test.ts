import test from "node:test";
import assert from "node:assert/strict";
import { maskEmail, signedInLine, THREAD_POLL_MS } from "./inbox.ts";

test("maskEmail keeps first letter and domain", () => {
  assert.equal(maskEmail("rohith@gmail.com"), "r***@gmail.com");
  assert.equal(maskEmail(""), "");
  assert.equal(maskEmail(null), "");
  assert.equal(maskEmail("bad"), "");
});

test("signedInLine names the account", () => {
  assert.equal(
    signedInLine("Rohith", "rohith@gmail.com"),
    "Signed in as Rohith · r***@gmail.com. Only messages for this account show here.",
  );
  assert.equal(signedInLine("", ""), "");
});

test("thread list polls at a sane interval", () => {
  assert.ok(THREAD_POLL_MS > 0 && THREAD_POLL_MS <= 10000);
});
