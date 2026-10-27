import type { Sql } from "@/lib/db";

/** Per-user limits, stored in Postgres (payment_utr_attempts, bucketed) so they hold across serverless instances. */
export const LIMITS = {
  utr: { max: 5, windowMinutes: 60 },
  message: { max: 30, windowMinutes: 10 },
  conversation: { max: 20, windowMinutes: 60 },
  apply: { max: 20, windowMinutes: 24 * 60 },
  report: { max: 10, windowMinutes: 24 * 60 },
  search: { max: 60, windowMinutes: 60 },
  listing: { max: 8, windowMinutes: 60 },
  otp_send: { max: 3, windowMinutes: 60 },
  otp_verify: { max: 10, windowMinutes: 60 },
} as const;

export type Bucket = keyof typeof LIMITS;

export class RateLimitError extends Error {
  constructor() {
    super("You're doing that too often. Please wait a little and try again.");
  }
}

/** Counts recent hits and records this one in a single statement. Throws RateLimitError when over the cap. */
export async function hitLimit(sql: Sql, userId: string, bucket: Bucket): Promise<void> {
  const { max, windowMinutes } = LIMITS[bucket];
  const rows = await sql.query<{ allowed: boolean }>(
    `with recent as (
       select count(*)::int as n from payment_utr_attempts
       where user_id = $1 and bucket = $2 and created_at > now() - make_interval(mins => $3::int)
     ), ins as (
       insert into payment_utr_attempts (id, user_id, bucket)
       select $4, $1, $2 from recent where n < $5
       returning id
     )
     select exists (select 1 from ins) as allowed`,
    [userId, bucket, windowMinutes, crypto.randomUUID(), max],
  );
  if (!rows[0]?.allowed) throw new RateLimitError();
}
