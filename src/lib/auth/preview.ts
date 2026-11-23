/**
 * Shared LIVE-PREVIEW OAuth client (server-only — NEVER import from the client).
 *
 * The sandbox serves each live preview on a dynamic `https://*.grok-sandbox.com`
 * URL, which can't be pre-registered per app. The broker instead exposes ONE
 * shared "preview" client that accepts any
 * `https://*.grok-sandbox.com/api/auth/oauth2/callback/*`
 * (broker: `app-builder-deployer/auth/src/preview-oauth.ts`). Baking it here lets
 * the live preview do REAL sign-in — no demo/mock users — with no platform
 * injection. When deployed the deployer injects a per-app
 * `GROK_AUTH_*` that overrides these (see `server.ts`).
 *
 * The client id is public. The client SECRET is NOT baked in: it is read from
 * the `GROK_PREVIEW_CLIENT_SECRET` env var (same name the broker uses). It must
 * equal the broker's `GROK_PREVIEW_CLIENT_SECRET` (the broker stores only its
 * `base64url(SHA-256)` hash). When it is unset, the shared preview client is
 * simply not registered (fail closed): no broker sign-in buttons, and there is
 * no hard-coded fallback. Email/password and native Google are unaffected.
 */
export const PREVIEW_CLIENT_ID = "grok_preview";

/** Env var holding the shared live-preview broker client secret. */
export const PREVIEW_CLIENT_SECRET_ENV = "GROK_PREVIEW_CLIENT_SECRET";

/**
 * Pick the broker client credentials. A per-app `GROK_AUTH_CLIENT_ID` +
 * `GROK_AUTH_CLIENT_SECRET` wins; otherwise the shared preview client, whose
 * secret must come from `GROK_PREVIEW_CLIENT_SECRET`. Returns null (broker off)
 * when no usable secret is present. Pure, so it is unit tested.
 */
export function resolveBrokerClient(
  read: (key: string) => string | undefined,
): { clientId: string; clientSecret: string; isPreview: boolean } | null {
  const get = (k: string) => {
    const v = read(k)?.trim();
    return v ? v : undefined;
  };
  const appId = get("GROK_AUTH_CLIENT_ID");
  const appSecret = get("GROK_AUTH_CLIENT_SECRET");
  if (appId && appId !== PREVIEW_CLIENT_ID) {
    return appSecret ? { clientId: appId, clientSecret: appSecret, isPreview: false } : null;
  }
  const previewSecret = get(PREVIEW_CLIENT_SECRET_ENV) ?? (appId === PREVIEW_CLIENT_ID ? appSecret : undefined);
  return previewSecret ? { clientId: PREVIEW_CLIENT_ID, clientSecret: previewSecret, isPreview: true } : null;
}

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks the preview client accepts. Better Auth derives
 * the live preview's real origin from the request host and validates it against
 * this list (wildcard-matched), so the OAuth `redirect_uri` becomes the concrete
 * `https://<preview-host>/api/auth/oauth2/callback/...` the broker allows.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
