/**
 * Home page "real beds" strip: the Mud Home account's OWN live listings, nothing else.
 * Rohith, 23 Nov 2026. The duplicate listing 47d697f8 (another account) is never featured here and is
 * otherwise left exactly as it is (it stays live).
 */
export const MUD_HOME_OWNER_ID = "ZLgGbKRKvVbLOF164BxJwm8ZH0PSpc0a";
/** Listing id prefixes that must never appear in the strip, whoever owns them. */
export const NEVER_FEATURE_PREFIXES = ["47d697f8"] as const;
export const FEATURED_LIMIT = 6;

export const FEATURED_SQL_WHERE = `l.owner_id = $1 and l.status = 'ACTIVE' and pr.account_status = 'ACTIVE'
       and l.is_demo = false and pr.identity_status = 'VERIFIED'
       and not (l.id::text like any($2::text[]))`;

export function featuredParams(): [string, string[]] {
  return [MUD_HOME_OWNER_ID, NEVER_FEATURE_PREFIXES.map((p) => `${p}%`)];
}

/** "Mud Home Premium PG · 6-sharing AC bed for working men · MPT Road, Bunder" -> "6-sharing AC bed for working men". */
export function shortBedTitle(title: string): string {
  const parts = title.split("·").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[1] : title.trim();
}
