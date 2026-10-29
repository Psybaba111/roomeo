import test from "node:test";
import assert from "node:assert/strict";
import { isSandboxHost, planSignInProviders } from "./provider-plan.ts";

const ids = (x: { id: string }[]) => x.map((p) => p.id).join(",");

test("production on the preview broker client: no broken broker buttons", () => {
  assert.equal(ids(planSignInProviders({ brokerClientIsPreview: true, host: "roomeo-eosin.vercel.app", googleConfigured: false })), "");
});

test("production with real Google credentials: native Google only", () => {
  assert.equal(ids(planSignInProviders({ brokerClientIsPreview: true, host: "roomeo-eosin.vercel.app", googleConfigured: true })), "google");
});

test("live preview sandbox keeps broker buttons", () => {
  assert.equal(ids(planSignInProviders({ brokerClientIsPreview: true, host: "abc.grok-sandbox.com", googleConfigured: false })), "grok-google,grok-x");
  assert.equal(isSandboxHost("abc.grok-sandbox.com:443"), true);
  assert.equal(isSandboxHost("grok-sandbox.com.evil.io"), false);
});

test("per-app broker client (deployer-injected) keeps broker buttons, Google not duplicated", () => {
  assert.equal(ids(planSignInProviders({ brokerClientIsPreview: false, host: "roomeo-eosin.vercel.app", googleConfigured: false })), "grok-google,grok-x");
  assert.equal(ids(planSignInProviders({ brokerClientIsPreview: false, host: "roomeo-eosin.vercel.app", googleConfigured: true })), "google,grok-x");
});
