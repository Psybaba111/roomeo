import test from "node:test";
import assert from "node:assert/strict";
import { chooseDriver, isNeonHost, parseTimeoutMs, withTimeout } from "./admin-connect.ts";

const neon = "postgresql://u:p@ep-cool-1-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require";
const local = "postgresql://u:p@127.0.0.1:5432/db";

test("isNeonHost", () => {
  assert.equal(isNeonHost(neon), true);
  assert.equal(isNeonHost(local), false);
  assert.equal(isNeonHost("postgresql://u@notneon.tech.example.com/db"), false);
  assert.equal(isNeonHost("not a url"), false);
});

test("chooseDriver: neon->http, others->tcp, flags override", () => {
  assert.equal(chooseDriver(neon, []), "http");
  assert.equal(chooseDriver(local, []), "tcp");
  assert.equal(chooseDriver(local, ["--http"]), "http");
  assert.equal(chooseDriver(neon, ["--tcp"]), "tcp");
});

test("parseTimeoutMs", () => {
  assert.equal(parseTimeoutMs([]), 15000);
  assert.equal(parseTimeoutMs(["--timeout=5"]), 5000);
  assert.equal(parseTimeoutMs(["--timeout=abc"]), 15000);
  assert.equal(parseTimeoutMs(["--timeout=0"]), 15000);
});

test("withTimeout resolves fast promises and rejects slow ones clearly", async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 1000, "x"), 7);
  await assert.rejects(withTimeout(new Promise(() => {}), 20, "Connecting"), /Connecting timed out after .*--http/);
});
