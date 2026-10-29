import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * MappStore WhatsApp Business (BSP) REST client.
 * Base https://mapp.mappstore.in/api/v1, `Authorization: Bearer <api_key>`, webhooks signed HMAC-SHA256 in
 * `X-Mappstore-Signature` (https://mappstore.in/rest-api.html).
 * Sends go to POST /messages/send (POST /messages is 404). The template body is MappStore's own flat shape, taken from
 * Athiti's production backend (WhatsAppService.php) which sends `otp_verification` this way:
 *   { to, type: "template", templateName, templateLanguage, templateParams: string[],
 *     buttonParams?: [{ index: 0, subType: "url", param: <otp> }] }
 * The API confirms `templateName` ("templateName is required for template messages").
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

export type MappstoreTemplateBody = {
  to: string;
  type: "template";
  templateName: string;
  templateLanguage: string;
  templateParams: string[];
  buttonParams?: Array<{ index: number; subType: "url"; param: string }>;
};

export function templatePayload(cfg: MappstoreConfig, toE164: string, name: string, opts: TemplateOptions = {}): MappstoreTemplateBody {
  const params = (opts.otpCode ? [opts.otpCode] : (opts.bodyParams ?? [])).map((t) => String(t).slice(0, 1024));
  return {
    to: waNumber(toE164),
    type: "template",
    templateName: name,
    templateLanguage: cfg.language,
    templateParams: params,
    // Authentication templates repeat the code in the copy-code (URL) button.
    ...(opts.otpCode ? { buttonParams: [{ index: 0, subType: "url" as const, param: String(opts.otpCode) }] } : {}),
  };
}

/**
 * Free-form session text (only valid inside the 24 h window). UNVERIFIED field name: no production example exists;
 * mirrors the flat template shape. Not used by any live flow yet.
 */
export function textPayload(_cfg: MappstoreConfig, toE164: string, text: string) {
  return { to: waNumber(toE164), type: "text" as const, text: text.slice(0, 4096) };
}

export async function mappstoreSend(cfg: MappstoreConfig, payload: unknown, fetcher: typeof fetch = fetch): Promise<{ id: string }> {
  const res = await fetcher(`${cfg.baseUrl}/messages/send`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new Error(`MappStore send failed (${res.status}).`);
  const d = json.data && typeof json.data === "object" ? json.data : {};
  const id = json.id ?? json.messageId ?? d.id ?? d.messageId ?? json.messages?.[0]?.id ?? d.messages?.[0]?.id ?? "";
  return { id: String(id) };
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
  if (!whatsappNotifyEnabled(env)) return "skipped";
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

/** Master switch for WhatsApp notifications. OFF unless MAPPSTORE_NOTIFY_ENABLED is exactly "true". */
export function whatsappNotifyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.MAPPSTORE_NOTIFY_ENABLED?.trim() === "true";
}

export type MappstoreEvent =
  | { kind: "status"; messageId: string; status: string }
  | { kind: "inbound"; from: string; text: string; optOut: boolean }
  | { kind: "unknown" };

const OPT_OUT = /^\s*(stop|unsubscribe|cancel|opt\s*out)\s*$/i;

/** Normalises MappStore webhook bodies (flat shape, or the Meta `entry[].changes[].value` shape it mirrors). */
export function parseMappstoreEvents(body: unknown): MappstoreEvent[] {
  if (!body || typeof body !== "object") return [{ kind: "unknown" }];
  const b = body as Record<string, any>;
  const values: Array<Record<string, any>> = Array.isArray(b.entry)
    ? b.entry.flatMap((e: any) => (Array.isArray(e?.changes) ? e.changes.map((c: any) => c?.value ?? {}) : []))
    : [b.data && typeof b.data === "object" ? { ...b.data, _type: b.type ?? b.event } : { ...b, _type: b.type ?? b.event }];
  const out: MappstoreEvent[] = [];
  for (const v of values) {
    for (const st of Array.isArray(v.statuses) ? v.statuses : []) out.push({ kind: "status", messageId: String(st?.id ?? ""), status: String(st?.status ?? "") });
    for (const m of Array.isArray(v.messages) ? v.messages : []) {
      const text = String(m?.text?.body ?? m?.button?.text ?? "");
      out.push({ kind: "inbound", from: String(m?.from ?? ""), text, optOut: OPT_OUT.test(text) });
    }
    if (!v.statuses && !v.messages) {
      const t = String(v._type ?? "");
      if (/status/i.test(t) || v.status) out.push({ kind: "status", messageId: String(v.messageId ?? v.id ?? ""), status: String(v.status ?? "") });
      else if (/message|inbound/i.test(t) && (v.from || v.text)) {
        const text = String(typeof v.text === "object" ? v.text?.body ?? "" : v.text ?? v.body ?? "");
        out.push({ kind: "inbound", from: String(v.from ?? ""), text, optOut: OPT_OUT.test(text) });
      }
    }
  }
  return out.length ? out : [{ kind: "unknown" }];
}
