import { test } from "node:test";
import assert from "node:assert/strict";
import { canSave, formLocked, saveButtonLabelFor, loadErrorMessage, LOADING_LABEL } from "./profile-load.ts";

test("save blocked while profile is loading", () => {
  assert.equal(canSave({ kind: "loading" }), false);
  assert.equal(formLocked({ kind: "loading" }), true);
  assert.equal(saveButtonLabelFor({ kind: "loading" }, "Save profile"), LOADING_LABEL);
});

test("save blocked when load failed", () => {
  const s = { kind: "failed", reason: "network" } as const;
  assert.equal(canSave(s), false);
  assert.equal(formLocked(s), true);
  assert.notEqual(saveButtonLabelFor(s, "Save profile"), "Save profile");
});

test("save allowed once loaded, save label passes through", () => {
  assert.equal(canSave({ kind: "loaded" }), true);
  assert.equal(formLocked({ kind: "loaded" }), false);
  assert.equal(saveButtonLabelFor({ kind: "loaded" }, "Saving…"), "Saving…");
});

test("load error message is friendly with or without reason", () => {
  assert.match(loadErrorMessage("boom"), /boom/);
  assert.match(loadErrorMessage("  "), /retry/);
});

test("regression: profile page gates Save and submit on load state", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../routes/profile.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(!canSave\(load\) \|\| isSaving\(status\)\) return;/);
  assert.match(src, /disabled=\{!canSave\(load\) \|\| isSaving\(status\)\}/);
  assert.match(src, /<fieldset disabled=\{formLocked\(load\)\}/);
  assert.match(src, /setLoad\(\{ kind: "loaded" \}\)/);
  assert.match(src, /setLoad\(\{ kind: "failed"/);
  assert.match(src, /Retry/);
});
