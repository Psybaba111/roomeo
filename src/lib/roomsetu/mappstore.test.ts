import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mappstoreConfig, mappstoreSend, mappstoreSignatureValid, notifyWhatsApp, parseMappstoreEvents, whatsappNotifyEnabled, templatePayload, textPayload, waNumber } from "./mappstore.ts";
import { MappstoreWhatsappOtpProvider, otpProviderFromEnv } from "./otp.ts";

const ENV = { MAPPSTORE_API_KEY: "test-key", MAPPSTORE_SENDER: "919000000000", MAPPSTORE_NOTIFY_ENABLED: "true" };
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

test("template payload uses MappStore's flat /messages/send shape", () => {
  const p = templatePayload(cfg, "+919876543210", "roomeo_application_received", { bodyParams: ["Asha", "Bed in HSR"] });
  assert.deepEqual(p, {
    to: "919876543210",
    type: "template",
    templateName: "roomeo_application_received",
    templateLanguage: "en",
    templateParams: ["Asha", "Bed in HSR"],
  });
});

test("OTP template puts the code in templateParams and the copy-code buttonParams", () => {
  const p = templatePayload(cfg, "+919876543210", "otp_verification", { otpCode: "123456" });
  assert.deepEqual(p, {
    to: "919876543210",
    type: "template",
    templateName: "otp_verification",
    templateLanguage: "en",
    templateParams: ["123456"],
    buttonParams: [{ index: 0, subType: "url", param: "123456" }],
  });
  assert.deepEqual(textPayload(cfg, "+919876543210", "hi"), { to: "919876543210", type: "text", text: "hi" });
});

test("send posts to /messages/send with Bearer auth and surfaces failures", async () => {
  const ok = mockFetch();
  assert.deepEqual(await mappstoreSend(cfg, { a: 1 }, ok.fn), { id: "msg_1" });
  assert.equal(ok.calls[0].url, "https://mapp.mappstore.in/api/v1/messages/send");
  assert.equal((ok.calls[0].init.headers as Record<string, string>).authorization, "Bearer test-key");
  assert.deepEqual(await mappstoreSend(cfg, {}, mockFetch(200, { success: true, data: { messageId: "wamid.X" } }).fn), { id: "wamid.X" });
  await assert.rejects(mappstoreSend(cfg, {}, mockFetch(400, { error: "templateName is required for template messages" }).fn), /400/);
  await assert.rejects(mappstoreSend(cfg, {}, mockFetch(401, { error: "Unauthorized" }).fn), /401/);
});

test("notifications skip without template env, never throw on failure", async () => {
  const m = mockFetch();
  assert.equal(await notifyWhatsApp("paymentApproved", "+919876543210", ["Premium", "₹499", "RMX"], ENV, m.fn), "skipped");
  assert.equal(await notifyWhatsApp("paymentApproved", null, [], { ...ENV, MAPPSTORE_TPL_PAYMENT_APPROVED: "t" }, m.fn), "skipped");
  assert.equal(m.calls.length, 0);
  assert.equal(await notifyWhatsApp("paymentApproved", "+919876543210", ["Premium"], { ...ENV, MAPPSTORE_TPL_PAYMENT_APPROVED: "roomeo_payment_approved" }, m.fn), "sent");
  assert.equal(JSON.parse(String(m.calls[0].init.body)).templateName, "roomeo_payment_approved");
  assert.equal(await notifyWhatsApp("applicationAccepted", "+919876543210", ["x"], { ...ENV, MAPPSTORE_TPL_APPLICATION_ACCEPTED: "t" }, mockFetch(500).fn), "failed");
});

test("whatsapp OTP provider sends the auth template; env wiring", async () => {
  const m = mockFetch();
  await new MappstoreWhatsappOtpProvider(cfg, "roomeo_otp", m.fn).send("+919876543210", "ignored", "654321");
  assert.equal(JSON.parse(String(m.calls[0].init.body)).templateParams[0], "654321");
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

test("WhatsApp notifications are OFF unless MAPPSTORE_NOTIFY_ENABLED=true", async () => {
  assert.equal(whatsappNotifyEnabled({}), false);
  assert.equal(whatsappNotifyEnabled({ MAPPSTORE_NOTIFY_ENABLED: "1" }), false);
  const m = mockFetch(200, { id: "x" });
  const off = { MAPPSTORE_API_KEY: "k", MAPPSTORE_TPL_PAYMENT_APPROVED: "t" };
  assert.equal(await notifyWhatsApp("paymentApproved", "+919876543210", ["a"], off, m.fn), "skipped");
});

test("parseMappstoreEvents handles Meta-shaped and flat bodies", () => {
  const meta = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered" }], messages: [{ from: "919876543210", text: { body: "STOP" } }] } }] }] };
  assert.deepEqual(parseMappstoreEvents(meta), [
    { kind: "status", messageId: "wamid.1", status: "delivered" },
    { kind: "inbound", from: "919876543210", text: "STOP", optOut: true },
  ]);
  assert.deepEqual(parseMappstoreEvents({ type: "message.status", data: { messageId: "m2", status: "read" } }), [{ kind: "status", messageId: "m2", status: "read" }]);
  assert.deepEqual(parseMappstoreEvents({ event: "message.inbound", from: "91", text: "hi" }), [{ kind: "inbound", from: "91", text: "hi", optOut: false }]);
  assert.deepEqual(parseMappstoreEvents("x"), [{ kind: "unknown" }]);
});
