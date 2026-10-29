import { test } from "node:test";
import assert from "node:assert/strict";
import { vercelPreviewOrigins, VERCEL_PREVIEW_ORIGIN_PATTERN } from "./vercel-origins.ts";

test("adds nothing outside preview", () => {
  assert.deepEqual(vercelPreviewOrigins({ VERCEL_ENV: "production", VERCEL_URL: "x.vercel.app" }), []);
  assert.deepEqual(vercelPreviewOrigins({}), []);
});
test("trusts project preview pattern and deployment hosts on preview", () => {
  assert.deepEqual(
    vercelPreviewOrigins({ VERCEL_ENV: "preview", VERCEL_URL: "roomeo-abc.vercel.app", VERCEL_BRANCH_URL: "roomeo-git-b-psybaba111s-projects.vercel.app" }),
    [VERCEL_PREVIEW_ORIGIN_PATTERN, "https://roomeo-abc.vercel.app", "https://roomeo-git-b-psybaba111s-projects.vercel.app"],
  );
});
test("ignores malformed hosts", () => {
  assert.deepEqual(vercelPreviewOrigins({ VERCEL_ENV: "preview", VERCEL_URL: "evil.com/x" }), [VERCEL_PREVIEW_ORIGIN_PATTERN]);
});
