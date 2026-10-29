/**
 * Extra trusted origins for this project's own Vercel preview deployments.
 * Only applied when VERCEL_ENV === "preview" so production stays strict.
 */
export const VERCEL_PREVIEW_ORIGIN_PATTERN =
  "https://roomeo-*-psybaba111s-projects.vercel.app";

export function vercelPreviewOrigins(
  e: Record<string, string | undefined>,
): string[] {
  if (e.VERCEL_ENV !== "preview") return [];
  const out = [VERCEL_PREVIEW_ORIGIN_PATTERN];
  for (const h of [e.VERCEL_URL, e.VERCEL_BRANCH_URL]) {
    if (h && /^[a-z0-9.-]+$/i.test(h)) out.push(`https://${h}`);
  }
  return out;
}
