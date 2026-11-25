// Waitlist bot checks. ZZ TEST / @example.com only, throwaway PGlite.
import test from "node:test";
import assert from "node:assert/strict";
import { testDb } from "./pgtest.ts";
import { hitLimit, LIMITS, RateLimitError } from "./rate-limit.ts";
import { clientIpFrom, honeypotFilled, HONEYPOT_FIELD, waitlistIpKey, WAITLIST_IP_LIMIT } from "./waitlist-guard.ts";
import { validateWaitlist } from "./waitlist.ts";

test("honeypot: empty passes, any text is a bot", () => {
  assert.equal(honeypotFilled({ [HONEYPOT_FIELD]: "" }), false);
  assert.equal(honeypotFilled({}), false);
  assert.equal(honeypotFilled(null), false);
  assert.equal(honeypotFilled({ [HONEYPOT_FIELD]: "http://spam.example.com" }), true);
  // The extra field doesn't break normal validation.
  assert.equal(validateWaitlist({ name: "ZZ TEST Asha", contact: "zz.test.asha@example.com", city: "Mangaluru", role: "tenant", consent: true, [HONEYPOT_FIELD]: "" }).name, "ZZ TEST Asha");
});

test("client IP: first x-forwarded-for hop, else x-real-ip", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  assert.equal(clientIpFrom(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIpFrom(h({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIpFrom(null), "");
});

test("IP key is hashed (raw IP never stored) and stable", async () => {
  const k = await waitlistIpKey("203.0.113.7", "salt");
  assert.match(k, /^wl:[0-9a-f]{32}$/);
  assert.ok(!k.includes("203"));
  assert.equal(k, await waitlistIpKey("203.0.113.7", "salt"));
  assert.notEqual(k, await waitlistIpKey("203.0.113.8", "salt"));
});

test("per-IP limit: 5 sign-ups an hour, the 6th is refused, other IPs unaffected", async () => {
  assert.deepEqual(LIMITS.waitlist, WAITLIST_IP_LIMIT);
  const { pg, sql } = await testDb();
  const a = await waitlistIpKey("203.0.113.7", "s");
  const b = await waitlistIpKey("203.0.113.8", "s");
  for (let i = 0; i < WAITLIST_IP_LIMIT.max; i++) await hitLimit(sql, a, "waitlist");
  await assert.rejects(hitLimit(sql, a, "waitlist"), RateLimitError);
  await hitLimit(sql, b, "waitlist");
  await pg.close();
});
