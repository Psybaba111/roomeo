/**
 * Which "Continue with …" buttons to show. Pure so it can be unit-tested.
 *
 * Root cause this guards against: with no per-app `GROK_AUTH_CLIENT_ID`, the app
 * falls back to the shared `grok_preview` broker client, which only accepts
 * `*.grok-sandbox.com` callbacks. On roomeo-eosin.vercel.app the broker rejects
 * the redirect_uri (HTTP 400), so those buttons must not be shown there.
 */
export type SignInProvider = { id: string; label: string; kind: "social" | "broker" };

export const BROKER_PROVIDERS = [
  { id: "grok-google", label: "Google" },
  { id: "grok-x", label: "X" },
] as const;

export function isSandboxHost(host: string): boolean {
  return /(^|\.)grok-sandbox\.com$/i.test(host.split(":")[0] ?? "");
}

export function planSignInProviders(p: { brokerClientIsPreview: boolean; host: string; googleConfigured: boolean }): SignInProvider[] {
  const out: SignInProvider[] = [];
  if (p.googleConfigured) out.push({ id: "google", label: "Google", kind: "social" });
  const brokerOk = !p.brokerClientIsPreview || isSandboxHost(p.host);
  if (brokerOk) {
    for (const b of BROKER_PROVIDERS) {
      if (b.id === "grok-google" && p.googleConfigured) continue; // one Google button only
      out.push({ ...b, kind: "broker" });
    }
  }
  return out;
}
