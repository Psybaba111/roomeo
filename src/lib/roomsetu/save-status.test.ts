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

import { markSaved, clearSaved, savedRemainingMs, initialSaveStatus } from "./save-status.ts";

test("regression: 'saved' survives the profile page remounting/refetching right after save", () => {
  clearSaved();
  const t0 = 1_000_000;
  // save resolves
  markSaved(t0);
  // ~200ms later the session/profile refetch remounts the page: fresh state must still be 'saved'
  const remounted = initialSaveStatus(t0 + 200);
  assert.deepEqual(remounted, { kind: "saved" });
  assert.equal(saveStatusText(remounted), SAVED_MESSAGE);
  // still visible ~2s later (what the live screenshot checked)
  assert.deepEqual(initialSaveStatus(t0 + 2000), { kind: "saved" });
  assert.ok(savedRemainingMs(t0 + 2000) > 0);
  // hides after the window
  assert.deepEqual(initialSaveStatus(t0 + SAVED_HIDE_MS + 1), { kind: "idle" });
  // a new save attempt clears it
  markSaved(t0); clearSaved();
  assert.deepEqual(initialSaveStatus(t0 + 10), { kind: "idle" });
});
