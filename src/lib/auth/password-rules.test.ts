import { test } from "node:test";
import assert from "node:assert/strict";
import { changePasswordErrorText, checkNewPassword } from "./password-rules.ts";

test("checkNewPassword", () => {
  assert.match(checkNewPassword("", "abcdefgh", "abcdefgh"), /current/);
  assert.match(checkNewPassword("old12345", "short", "short"), /at least 8/);
  assert.match(checkNewPassword("same1234", "same1234", "same1234"), /same/);
  assert.match(checkNewPassword("old12345", "newpass12", "newpass13"), /match/);
  assert.match(checkNewPassword("old12345", "x".repeat(129), "x".repeat(129)), /too long/);
  assert.equal(checkNewPassword("old12345", "newpass12", "newpass12"), "");
});

test("changePasswordErrorText", () => {
  assert.match(changePasswordErrorText({ code: "INVALID_PASSWORD" }), /isn't right/);
  assert.match(changePasswordErrorText({ code: "CREDENTIAL_ACCOUNT_NOT_FOUND" }), /Google or X/);
  assert.match(changePasswordErrorText(null), /Couldn't/);
});
