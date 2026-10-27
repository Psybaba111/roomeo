import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mappstoreConfig, mappstoreSend, mappstoreSignatureValid, notifyWhatsApp, templatePayload, textPayload, waNumber } from "./mappstore.ts";
import { MappstoreWhatsappOtpProvider, otpProviderFromEnv } from "./otp.ts";

const ENV = { MAPPSTORE_API_KEY: "test-key", MAPPSTORE_SENDER: "919000000000" };
const cfg = mappstoreConfig(ENV)!;

function mockFetch(status = 200, body: unknown = { id: "msg_1" }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test("config defaults to the MappStore v1 base and needs a key", () => {
  assert.equal(mappstoreConfig({}), null);
  assert.equal(cfg.baseUrl, "https://mapp.mappstore.in/api/v1");
  assert.equal(mappstoreConfig({ ...ENV, MAPPSTORE_BASE_URL: "https://x/api/v1/" })!.baseUrl, "https://x/api/v1");
});

test("numbers are digits with country code", () => {
  assert.equal(waNumber("+91 98765 43210"), "919876543210");
  assert.throws(() => waNumber("123"));
});

test("template payload: body params, sender, language", () => {
  const p = templatePayload(cfg, "+919876543210", "roomeo_application_received", { bodyParams: ["Asha", "Bed in HSR"] });
  assert.equal(p.to, "919876543210");
  assert.equal(p.from, "919000000000");
  assert.deepEqual(p.template, {
    name: "roomeo_application_received",
    language: { code: "en" },
    components: [{ type: "body", parameters: [{ type: "text", text: "Asha" }, { type: "text", text: "Bed in HSR" }] }],
  });
});

test("authentication template puts the code in body and copy-code button", () => {
  const p = templatePayload(cfg, "+919876543210", "roomeo_otp", { otpCode: "123456" });
  assert.deepEqual(p.template.components, [
    { type: "body", parameters: [{ type: "text", text: "123456" }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
  ]);
  assert.deepEqual(textPayload(cfg, "+919876543210", "hi").text, { body: "hi", preview_url: false });
});

test("send posts to /messages with Bearer auth and surfaces failures", async () => {
  const ok = mockFetch();
  assert.deepEqual(await mappstoreSend(cfg, { a: 1 }, ok.fn), { id: "msg_1" });
  assert.equal(ok.calls[0].url, "https://mapp.mappstore.in/api/v1/messages");
  assert.equal((ok.calls[0].init.headers as Record<string, string>).authorization, "Bearer test-key");
  await assert.rejects(mappstoreSend(cfg, {}, mockFetch(401, { error: "Unauthorized" }).fn), /401/);
});

test("notifications skip without template env, never throw on failure", async () => {
  const m = mockFetch();
  assert.equal(await notifyWhatsApp("paymentApproved", "+919876543210", ["Premium", "₹499", "RMX"], ENV, m.fn), "skipped");
  assert.equal(await notifyWhatsApp("paymentApproved", null, [], { ...ENV, MAPPSTORE_TPL_PAYMENT_APPROVED: "t" }, m.fn), "skipped");
  assert.equal(m.calls.length, 0);
  assert.equal(await notifyWhatsApp("paymentApproved", "+919876543210", ["Premium"], { ...ENV, MAPPSTORE_TPL_PAYMENT_APPROVED: "roomeo_payment_approved" }, m.fn), "sent");
  assert.equal(JSON.parse(String(m.calls[0].init.body)).template.name, "roomeo_payment_approved");
  assert.equal(await notifyWhatsApp("applicationAccepted", "+919876543210", ["x"], { ...ENV, MAPPSTORE_TPL_APPLICATION_ACCEPTED: "t" }, mockFetch(500).fn), "failed");
});

test("whatsapp OTP provider sends the auth template; env wiring", async () => {
  const m = mockFetch();
  await new MappstoreWhatsappOtpProvider(cfg, "roomeo_otp", m.fn).send("+919876543210", "ignored", "654321");
  assert.equal(JSON.parse(String(m.calls[0].init.body)).template.components[0].parameters[0].text, "654321");
  await assert.rejects(new MappstoreWhatsappOtpProvider(cfg, "roomeo_otp", mockFetch(400).fn).send("+919876543210", "x", "1"), /WhatsApp/);
  assert.equal(otpProviderFromEnv({ OTP_PROVIDER: "mappstore-whatsapp", ...ENV }), null);
  assert.ok(otpProviderFromEnv({ OTP_PROVIDER: "mappstore-whatsapp", ...ENV, MAPPSTORE_TPL_OTP: "roomeo_otp" }) instanceof MappstoreWhatsappOtpProvider);
});

test("webhook signature check", () => {
  const body = '{"type":"status","status":"delivered"}';
  const sig = createHmac("sha256", "s3cret").update(body).digest("hex");
  assert.equal(mappstoreSignatureValid("s3cret", body, sig), true);
  assert.equal(mappstoreSignatureValid("s3cret", body, `sha256=${sig}`), true);
  assert.equal(mappstoreSignatureValid("s3cret", body + " ", sig), false);
  assert.equal(mappstoreSignatureValid("", body, sig), false);
  assert.equal(mappstoreSignatureValid("s3cret", body, null), false);
});
