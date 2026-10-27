import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * MappStore WhatsApp Business (BSP) REST client.
 * Verified: base https://mapp.mappstore.in/api/v1, `Authorization: Bearer <api_key>` (the API's own 401 says so),
 * POST /messages for session + template sends, webhooks signed HMAC-SHA256 in `X-Mappstore-Signature`
 * (https://mappstore.in/rest-api.html). The JSON body follows the Meta Cloud API shape, which MappStore says it mirrors;
 * its OpenAPI spec is behind auth, so confirm field names against it before go-live.
 */
export type MappstoreConfig = { apiKey: string; baseUrl: string; sender: string; language: string };

export function mappstoreConfig(env: Record<string, string | undefined> = process.env): MappstoreConfig | null {
  const apiKey = env.MAPPSTORE_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env.MAPPSTORE_BASE_URL?.trim() || "https://mapp.mappstore.in/api/v1").replace(/\/$/, ""),
    sender: env.MAPPSTORE_SENDER?.trim() ?? "",
    language: env.MAPPSTORE_TEMPLATE_LANG?.trim() || "en",
  };
}

/** WhatsApp wants digits only with country code, e.g. 919876543210. */
export function waNumber(phoneE164: string): string {
  const d = phoneE164.replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(d)) throw new Error("Invalid WhatsApp number.");
  return d;
}

export type TemplateOptions = { bodyParams?: string[]; otpCode?: string };

export function templatePayload(cfg: MappstoreConfig, toE164: string, name: string, opts: TemplateOptions = {}) {
  const components: Array<Record<string, unknown>> = [];
  const body = opts.otpCode ? [opts.otpCode] : (opts.bodyParams ?? []);
  if (body.length) components.push({ type: "body", parameters: body.map((text) => ({ type: "text", text: String(text).slice(0, 1024) })) });
  // Meta authentication templates carry the code again in the copy-code / one-tap URL button.
  if (opts.otpCode) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: opts.otpCode }] });
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: waNumber(toE164),
    ...(cfg.sender ? { from: cfg.sender } : {}),
    type: "template",
    template: { name, language: { code: cfg.language }, components },
  };
}

export function textPayload(cfg: MappstoreConfig, toE164: string, text: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: waNumber(toE164),
    ...(cfg.sender ? { from: cfg.sender } : {}),
    type: "text",
    text: { body: text.slice(0, 4096), preview_url: false },
  };
}

export async function mappstoreSend(cfg: MappstoreConfig, payload: unknown, fetcher: typeof fetch = fetch): Promise<{ id: string }> {
  const res = await fetcher(`${cfg.baseUrl}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`MappStore send failed (${res.status}).`);
  const messages = json.messages as Array<{ id?: string }> | undefined;
  return { id: String(json.id ?? messages?.[0]?.id ?? "") };
}

/** Verifies `X-Mappstore-Signature` (hex HMAC-SHA256 of the raw body; an optional `sha256=` prefix is tolerated). */
export function mappstoreSignatureValid(secret: string, rawBody: string, header: string | null): boolean {
  if (!secret || !header) return false;
  const got = header.trim().replace(/^sha256=/i, "");
  const want = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(got, "hex");
  const b = Buffer.from(want, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const NOTIFY_EVENTS = {
  applicationReceived: "MAPPSTORE_TPL_APPLICATION_RECEIVED",
  applicationAccepted: "MAPPSTORE_TPL_APPLICATION_ACCEPTED",
  paymentApproved: "MAPPSTORE_TPL_PAYMENT_APPROVED",
} as const;
export type NotifyEvent = keyof typeof NOTIFY_EVENTS;

/**
 * Best-effort WhatsApp notification. Never throws: in-app notifications stay the source of truth.
 * No-op unless the API key and the event's template name are both set.
 */
export async function notifyWhatsApp(
  event: NotifyEvent,
  phoneE164: string | null | undefined,
  bodyParams: string[],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<"sent" | "skipped" | "failed"> {
  const cfg = mappstoreConfig(env);
  const template = env[NOTIFY_EVENTS[event]]?.trim();
  if (!cfg || !template || !phoneE164) return "skipped";
  try {
    await mappstoreSend(cfg, templatePayload(cfg, phoneE164, template, { bodyParams }), fetcher);
    return "sent";
  } catch (e) {
    console.warn(`[whatsapp] ${event} failed: ${e instanceof Error ? e.message : "error"}`);
    return "failed";
  }
}
