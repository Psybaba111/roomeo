import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PREVIEW_CLIENT_ID, PREVIEW_CLIENT_SECRET_ENV, resolveBrokerClient } from "./preview.ts";

const from = (o: Record<string, string>) => (k: string) => o[k];

test("preview client secret comes only from GROK_PREVIEW_CLIENT_SECRET", () => {
  assert.equal(PREVIEW_CLIENT_SECRET_ENV, "GROK_PREVIEW_CLIENT_SECRET");
  assert.deepEqual(resolveBrokerClient(from({ GROK_PREVIEW_CLIENT_SECRET: "s1" })), { clientId: PREVIEW_CLIENT_ID, clientSecret: "s1", isPreview: true });
});

test("fail closed: no secret, or a blank one, means no broker client", () => {
  assert.equal(resolveBrokerClient(from({})), null);
  assert.equal(resolveBrokerClient(from({ GROK_PREVIEW_CLIENT_SECRET: "   " })), null);
  assert.equal(resolveBrokerClient(from({ GROK_AUTH_CLIENT_ID: "app_1" })), null);
});

test("per-app client wins over the preview client", () => {
  assert.deepEqual(
    resolveBrokerClient(from({ GROK_AUTH_CLIENT_ID: "app_1", GROK_AUTH_CLIENT_SECRET: "a", GROK_PREVIEW_CLIENT_SECRET: "p" })),
    { clientId: "app_1", clientSecret: "a", isPreview: false },
  );
});

test("no hard-coded 64-hex secret left in the auth sources", () => {
  for (const f of ["preview.ts", "server.ts"]) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /["'][0-9a-f]{64}["']/i, f);
  }
});
