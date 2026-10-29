import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { mappstoreConfig, mappstoreSend, templatePayload, type MappstoreConfig } from "./mappstore.ts";

/** Pluggable SMS sender for phone OTP. No vendor lock-in; no Firebase. */
export interface OtpProvider {
  readonly name: string;
  /** `code` is passed separately for template-based channels (WhatsApp authentication templates). */
  send(phoneE164: string, message: string, code?: string): Promise<void>;
}

/** WhatsApp OTP through MappStore using a Meta-approved AUTHENTICATION template (copy-code button). */
export class MappstoreWhatsappOtpProvider implements OtpProvider {
  readonly name = "mappstore-whatsapp";
  private readonly cfg: MappstoreConfig;
  private readonly template: string;
  private readonly fetcher: typeof fetch;
  constructor(cfg: MappstoreConfig, template: string, fetcher: typeof fetch = fetch) {
    this.cfg = cfg;
    this.template = template;
    this.fetcher = fetcher;
  }
  async send(phoneE164: string, _message: string, code?: string) {
    if (!code) throw new Error("WhatsApp OTP needs the code.");
    try {
      await mappstoreSend(this.cfg, templatePayload(this.cfg, phoneE164, this.template, { otpCode: code }), this.fetcher);
    } catch {
      throw new Error("Could not send the code on WhatsApp. Try again shortly.");
    }
  }
}

/** Dev only: prints the code to the server log. Refused in production unless OTP_ALLOW_CONSOLE=true. */
export class ConsoleOtpProvider implements OtpProvider {
  readonly name = "console";
  async send(phoneE164: string, message: string) {
    console.info(`[otp:console] to ${phoneE164}: ${message}`);
  }
}

/**
 * Self-hosted, open-source SMS gateway: capcom6/android-sms-gateway (Apache-2.0).
 * Runs on any Android phone with a SIM, so OTPs cost only your SIM plan.
 * Works with the app's local server (http://<phone-ip>:8080) or its cloud relay (https://api.sms-gate.app/3rdparty/v1).
 */
export class SmsGatewayOtpProvider implements OtpProvider {
  readonly name = "sms-gateway";
  private readonly url: string;
  private readonly user: string;
  private readonly password: string;
  private readonly fetcher: typeof fetch;
  constructor(url: string, user: string, password: string, fetcher: typeof fetch = fetch) {
    this.url = url;
    this.user = user;
    this.password = password;
    this.fetcher = fetcher;
  }
  async send(phoneE164: string, message: string) {
    const res = await this.fetcher(`${this.url.replace(/\/$/, "")}/message`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${this.user}:${this.password}`).toString("base64")}`,
      },
      body: JSON.stringify({ message, phoneNumbers: [phoneE164] }),
    });
    if (!res.ok) throw new Error("Could not send the code. Try again shortly.");
  }
}

export function otpProviderFromEnv(env: Record<string, string | undefined> = process.env): OtpProvider | null {
  const kind = (env.OTP_PROVIDER ?? "").trim().toLowerCase();
  if (kind === "mappstore-whatsapp") {
    const cfg = mappstoreConfig(env);
    const template = env.MAPPSTORE_TPL_OTP?.trim();
    return cfg && template ? new MappstoreWhatsappOtpProvider(cfg, template) : null;
  }
  if (kind === "sms-gateway") {
    const url = env.SMS_GATEWAY_URL?.trim();
    const user = env.SMS_GATEWAY_USER?.trim();
    const password = env.SMS_GATEWAY_PASSWORD?.trim();
    return url && user && password ? new SmsGatewayOtpProvider(url, user, password) : null;
  }
  if (kind === "console" || (!kind && env.NODE_ENV !== "production")) {
    if (env.NODE_ENV === "production" && env.OTP_ALLOW_CONSOLE !== "true") return null;
    return new ConsoleOtpProvider();
  }
  return null;
}

/** Accepts Indian mobile numbers in common forms and returns +91XXXXXXXXXX. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, "").replace(/^\+?91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

export function generateOtp(rand: (max: number) => number = (max) => randomInt(max)): string {
  return String(rand(1_000_000)).padStart(6, "0");
}

export function hashOtp(userId: string, phoneE164: string, code: string): string {
  return createHash("sha256").update(`${userId}|${phoneE164}|${code}`).digest("hex");
}

export function otpMatches(expectedHash: string, userId: string, phoneE164: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const a = Buffer.from(expectedHash, "hex");
  const b = Buffer.from(hashOtp(userId, phoneE164, code), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const OTP_TTL_MINUTES = 10;
/** The approved MappStore AUTHENTICATION template's copy-code button says "Expires in 5 minutes", so match it. */
export const WHATSAPP_OTP_TTL_MINUTES = 5;
export function otpTtlMinutes(provider: Pick<OtpProvider, "name">): number {
  return provider.name === "mappstore-whatsapp" ? WHATSAPP_OTP_TTL_MINUTES : OTP_TTL_MINUTES;
}
export const OTP_MAX_ATTEMPTS = 5;

/** Listing publish gate: both phone and ID must be verified. */
export function canPublish(p: { identityStatus: string; phoneVerified: boolean }): boolean {
  return p.identityStatus === "VERIFIED" && p.phoneVerified;
}
