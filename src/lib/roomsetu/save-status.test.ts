import { test } from "node:test";
import assert from "node:assert/strict";
import { saveButtonLabel, isSaving, saveStatusText, saveErrorMessage, SAVED_MESSAGE, SAVED_HIDE_MS } from "./save-status.ts";

test("button shows Saving… and is disabled only while saving", () => {
  assert.equal(saveButtonLabel({ kind: "saving" }), "Saving…");
  assert.equal(isSaving({ kind: "saving" }), true);
  for (const s of [{ kind: "idle" }, { kind: "saved" }, { kind: "error", reason: "x" }] as const) {
    assert.equal(saveButtonLabel(s), "Save profile");
    assert.equal(isSaving(s), false);
  }
});

test("success message is shown and auto-hides after a few seconds", () => {
  assert.equal(saveStatusText({ kind: "saved" }), SAVED_MESSAGE);
  assert.match(SAVED_MESSAGE, /Profile saved ✓/);
  assert.ok(SAVED_HIDE_MS >= 2000 && SAVED_HIDE_MS <= 6000);
});

test("error message includes the reason, with a fallback", () => {
  assert.equal(saveStatusText({ kind: "error", reason: "Age must be 18+" }), "Oops, couldn't save that: Age must be 18+");
  assert.match(saveErrorMessage("  "), /try again/);
  assert.equal(saveStatusText({ kind: "idle" }), "");
  assert.equal(saveStatusText({ kind: "saving" }), "");
});
