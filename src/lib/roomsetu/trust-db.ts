// DB side of the trust fields. Reads and writes tolerate a database that has not run
// migration 0016 yet (preview deploys share prod and migrations are a manual step), so the
// app never breaks: missing columns just mean "no all-in price / default 7 day refund".
import type { Sql } from "@/lib/db";
import { num, str } from "@/lib/roomsetu/map";
import { DEFAULT_REFUND_DAYS, type TrustFields } from "@/lib/roomsetu/trust";

export async function readTrust(
  sql: Sql,
  listingId: string,
): Promise<TrustFields & { ready: boolean }> {
  try {
    const r = await sql.query<Record<string, unknown>>(
      "select all_in_inr, all_in_includes, video_tour_url, deposit_refund_days from listings where id = $1",
      [listingId],
    );
    const row = r[0] ?? {};
    return {
      ready: true,
      allInInr: row.all_in_inr == null ? null : num(row.all_in_inr),
      allInIncludes: str(row.all_in_includes),
      videoTourUrl: str(row.video_tour_url),
      depositRefundDays: num(row.deposit_refund_days) || DEFAULT_REFUND_DAYS,
    };
  } catch {
    return {
      ready: false,
      allInInr: null,
      allInIncludes: "",
      videoTourUrl: "",
      depositRefundDays: DEFAULT_REFUND_DAYS,
    };
  }
}

/** Upload date per photo URL (null when unknown or before migration 0016). */
export async function readPhotoDates(sql: Sql, listingId: string): Promise<Map<string, string>> {
  try {
    const r = await sql.query<Record<string, unknown>>(
      "select url, uploaded_at::text as uploaded_at from listing_images where listing_id = $1 and uploaded_at is not null",
      [listingId],
    );
    return new Map(r.map((x) => [str(x.url), str(x.uploaded_at)]));
  } catch {
    return new Map();
  }
}

export async function writeTrust(sql: Sql, listingId: string, t: TrustFields): Promise<boolean> {
  try {
    await sql.query(
      "update listings set all_in_inr = $2, all_in_includes = $3, video_tour_url = $4, deposit_refund_days = $5 where id = $1",
      [listingId, t.allInInr, t.allInIncludes, t.videoTourUrl, t.depositRefundDays],
    );
    return true;
  } catch {
    return false;
  }
}
