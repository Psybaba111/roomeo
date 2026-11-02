// ID verification gate + provider abstraction (prototype, 2 Nov 2026). OFF unless ROOMEO_ID_VERIFICATION_ENABLED=true.
type Env = Record<string, string | undefined>;
const procEnv = (): Env => (typeof process === "undefined" ? {} : process.env);
const on = (v: string | undefined) => ["true", "1", "on", "yes"].includes((v ?? "").trim().toLowerCase());

export function idVerificationEnabled(env: Env = procEnv()): boolean {
  return on(env.ROOMEO_ID_VERIFICATION_ENABLED);
}

export const ID_DOC_TYPES = ["AADHAAR", "STUDENT_ID"] as const;
export type IdDocType = (typeof ID_DOC_TYPES)[number];
export const DOC_LABEL: Record<IdDocType, string> = { AADHAAR: "Aadhaar (DigiLocker)", STUDENT_ID: "Student ID (DigiLocker)" };

export type GatedAction = "TRIAL_BOOKING" | "DEAL_ACCEPT" | "DEAL_SIGN";
const ACTION_TEXT: Record<GatedAction, string> = {
  TRIAL_BOOKING: "booking a trial night",
  DEAL_ACCEPT: "accepting a request",
  DEAL_SIGN: "signing the agreement",
};

/** Pure gate: null = allowed, else the message to show. Allowed when the flag is off or the user is VERIFIED. */
export function idGate(p: { enabled: boolean; identityStatus: string | null | undefined; action: GatedAction }): string | null {
  if (!p.enabled) return null;
  if ((p.identityStatus ?? "").toUpperCase() === "VERIFIED") return null;
  return `Verify your ID with DigiLocker (Aadhaar or student ID) on the Verification page before ${ACTION_TEXT[p.action]}. It takes about a minute.`;
}

/** Keep only the last 4 characters of an ID; never store the full number. */
export function last4(id: string): string {
  const clean = id.replace(/[^0-9A-Za-z]/g, "");
  return clean.length >= 4 ? clean.slice(-4) : "";
}

export type IdResult = { ok: true; name: string; idLast4: string; providerRef: string } | { ok: false; reason: string };

export interface IdProvider {
  readonly name: string;
  /** Where to send the user to give consent. */
  startUrl(p: { verificationId: string; docType: IdDocType; returnUrl: string }): string;
  /** Turn the provider's callback into a result. */
  complete(p: { verificationId: string; payload: Record<string, unknown> }): Promise<IdResult>;
}

/** Local/dev only. No network, no real person. The mock page posts outcome=pass|fail. */
export class MockIdProvider implements IdProvider {
  readonly name = "mock";
  startUrl(p: { verificationId: string; docType: IdDocType }) {
    return `/verify/id-mock?v=${encodeURIComponent(p.verificationId)}&doc=${p.docType}`;
  }
  async complete(p: { verificationId: string; payload: Record<string, unknown> }): Promise<IdResult> {
    if (p.payload.outcome !== "pass") return { ok: false, reason: "DigiLocker consent was declined (mock)." };
    const name = String(p.payload.name ?? "").trim();
    if (name.length < 2) return { ok: false, reason: "No name came back (mock)." };
    return { ok: true, name, idLast4: last4(String(p.payload.idNumber ?? "")), providerRef: `mock-${p.verificationId.slice(0, 8)}` };
  }
}

/** Provider from env. Only "mock" exists in this prototype; refused in production. */
export function idProviderFromEnv(env: Env = procEnv()): IdProvider | null {
  const kind = (env.ID_PROVIDER ?? "").trim().toLowerCase();
  if (kind === "mock" || (!kind && env.NODE_ENV !== "production")) {
    if (env.NODE_ENV === "production" && env.ID_PROVIDER_ALLOW_MOCK !== "true") return null;
    return new MockIdProvider();
  }
  return null;
}
