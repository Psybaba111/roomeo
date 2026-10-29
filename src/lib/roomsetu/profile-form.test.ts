import { test } from "node:test";
import assert from "node:assert/strict";
import { numField, digitsOnly, toNumberOrNull } from "./profile-form.ts";
import { readFileSync } from "node:fs";

test("age/budget round-trip between form and API", () => {
  assert.equal(numField(24), "24");
  assert.equal(numField(null), "");
  assert.equal(toNumberOrNull("24"), 24);
  assert.equal(toNumberOrNull(""), null);
  assert.equal(toNumberOrNull("12,000"), 12000);
  assert.equal(digitsOnly("₹8000"), "8000");
});

test("regression: profile load effect is keyed on user id, not the user object", () => {
  const src = readFileSync(new URL("../../routes/profile.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\}, \[user\]\)/);
  assert.match(src, /\}, \[userId(, loadAttempt)?\]\)/);
  assert.doesNotMatch(src, /setForm\(\{ \.\.\.form,/);
});

test("regression: useCurrentUserState memoizes the user object", () => {
  const src = readFileSync(new URL("../auth/use-current-user.ts", import.meta.url), "utf8");
  assert.match(src, /useMemo\(/);
});
