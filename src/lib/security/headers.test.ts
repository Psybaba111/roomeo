import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SECURITY_HEADERS } from "./headers.ts";

test("security headers: framing blocked, nosniff, referrer and permissions policy set", () => {
  assert.equal(SECURITY_HEADERS["X-Frame-Options"], "SAMEORIGIN");
  assert.equal(SECURITY_HEADERS["X-Content-Type-Options"], "nosniff");
  assert.equal(SECURITY_HEADERS["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(SECURITY_HEADERS["Permissions-Policy"], /camera=\(\)/);
  assert.match(SECURITY_HEADERS["Content-Security-Policy"], /frame-ancestors 'self'/);
  assert.match(SECURITY_HEADERS["Content-Security-Policy"], /object-src 'none'/);
});

test("enforced CSP stays non-breaking; script rules are report-only", () => {
  assert.doesNotMatch(SECURITY_HEADERS["Content-Security-Policy"], /script-src|default-src/);
  const ro = SECURITY_HEADERS["Content-Security-Policy-Report-Only"];
  for (const host of ["https://www.googletagmanager.com", "https://connect.facebook.net", "https://grok.com"]) assert.ok(ro.includes(host), host);
});

test("vite config adds one Vercel route with the headers for every path, continuing to the app", () => {
  const cfg = readFileSync(new URL("../../../vite.config.ts", import.meta.url), "utf8");
  assert.match(cfg, /routes: \[\{ src: "\/\(\.\*\)", headers: SECURITY_HEADERS, continue: true \}\]/);
});
