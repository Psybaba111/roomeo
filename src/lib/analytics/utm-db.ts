// First-touch UTM storage (migration 0030 adds nullable utm_source / utm_medium / utm_campaign columns to
// "user", listings and waitlist_signups). Best effort: a database without 0030 (prod today) just skips the write,
// so the sign-up / listing / waitlist save itself can never fail because of attribution.
import type { Sql } from "../db.ts";

export type Utm = { source: string | null; medium: string | null; campaign: string | null };
export const UTM_TABLES = { user: '"user"', listings: "listings", waitlist_signups: "waitlist_signups" } as const;

export const hasUtm = (u: Utm | null | undefined): u is Utm => Boolean(u && (u.source || u.medium || u.campaign));

/** First touch wins: only fills columns that are still null. Returns "saved" | "skipped" | "no_columns". */
export async function saveUtm(sql: Sql, table: keyof typeof UTM_TABLES, id: string, utm: Utm | null | undefined): Promise<"saved" | "skipped" | "no_columns"> {
  if (!hasUtm(utm) || !id) return "skipped";
  const t = UTM_TABLES[table];
  try {
    await sql.query(
      `update ${t} set utm_source = coalesce(utm_source, $2), utm_medium = coalesce(utm_medium, $3), utm_campaign = coalesce(utm_campaign, $4)
        where id = $1 and utm_source is null and utm_medium is null and utm_campaign is null`,
      [id, utm.source, utm.medium, utm.campaign],
    );
    return "saved";
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "42703" || /column .*utm_/i.test(String((e as Error)?.message))) return "no_columns";
    console.error("[utm] save failed", String(e).slice(0, 160));
    return "skipped";
  }
}
