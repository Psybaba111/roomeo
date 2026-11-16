// Waitlist storage (migration 0029). Server-only helpers; Sql is the app's tagged/`query` client.
import type { Sql } from "../db.ts";
import type { WaitlistInput, WaitlistRow } from "./waitlist.ts";

export const WAITLIST_TABLE_MISSING = "The waitlist isn't set up on this database yet (migration 0029).";
/** Simple flood guard for an anonymous form: at most this many brand-new sign-ups per 10 minutes, site-wide. */
export const WAITLIST_FLOOD_MAX = 300;

const missingTable = (e: unknown) => (e as { code?: string })?.code === "42P01" || /waitlist_signups.*does not exist/.test(String((e as Error)?.message));

export type JoinResult = { status: "joined" | "updated"; id: string };

/**
 * Add (or refresh) a sign-up, deduped on email or phone. Writes one metric_events 'waitlist_join' row for new
 * sign-ups only. Answers from the quiz are never stored here, only the type key.
 */
export async function joinWaitlist(sql: Sql, w: WaitlistInput, userId: string | null = null, now = new Date()): Promise<JoinResult> {
  try {
    const existing = await sql.query<{ id: string }>(
      `select id from waitlist_signups where ($1::text is not null and lower(email) = lower($1)) or ($2::text is not null and phone = $2) order by created_at limit 1`,
      [w.email, w.phone],
    );
    if (existing[0]) {
      const id = String(existing[0].id);
      const base = `update waitlist_signups set name = $2, city = $3, role = $4, roomie_type = coalesce($5, roomie_type),
           user_id = coalesce(user_id, $6), consent_at = $7, updated_at = $7`;
      const args = [id, w.name, w.city, w.role, w.roomieType, userId, now.toISOString()];
      try {
        // Fill in the other contact detail if we didn't have it yet.
        await sql.query(`${base}, email = coalesce(email, $8), phone = coalesce(phone, $9) where id = $1`, [...args, w.email, w.phone]);
      } catch (e) {
        if ((e as { code?: string })?.code !== "23505") throw e;
        await sql.query(`${base} where id = $1`, args); // that email/phone belongs to another sign-up: keep both rows as they are
      }
      return { status: "updated", id };
    }
    const recent = await sql.query<{ n: number }>(`select count(*)::int as n from waitlist_signups where created_at > $1::timestamptz - interval '10 minutes'`, [now.toISOString()]);
    if (Number(recent[0]?.n ?? 0) >= WAITLIST_FLOOD_MAX) throw new Error("Lots of people joining right now. Try again in a few minutes.");
    const id = crypto.randomUUID();
    await sql.query(
      `insert into waitlist_signups (id, name, email, phone, city, role, roomie_type, source, user_id, consent_at, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $10)`,
      [id, w.name, w.email, w.phone, w.city, w.role, w.roomieType, w.source, userId, now.toISOString()],
    );
    await sql.query(`insert into metric_events (id, kind, city) values ($1, 'waitlist_join', $2)`, [crypto.randomUUID(), w.city]);
    return { status: "joined", id };
  } catch (e) {
    if (missingTable(e)) throw new Error(WAITLIST_TABLE_MISSING);
    throw e;
  }
}

export async function listWaitlist(sql: Sql, limit = 5000): Promise<{ rows: WaitlistRow[]; total: number; byRole: Record<string, number> }> {
  try {
    const rows = await sql.query<Record<string, unknown>>(
      `select id, name, email, phone, city, role, roomie_type, source,
              to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as created_at
       from waitlist_signups order by created_at desc limit $1`,
      [limit],
    );
    const agg = await sql.query<{ role: string; n: number }>(`select role, count(*)::int as n from waitlist_signups group by role`);
    const byRole: Record<string, number> = {};
    for (const a of agg) byRole[String(a.role)] = Number(a.n);
    return {
      total: Object.values(byRole).reduce((a, b) => a + b, 0),
      byRole,
      rows: rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        email: r.email == null ? null : String(r.email),
        phone: r.phone == null ? null : String(r.phone),
        city: String(r.city),
        role: String(r.role),
        roomieType: r.roomie_type == null ? null : String(r.roomie_type),
        source: String(r.source),
        createdAt: String(r.created_at),
      })),
    };
  } catch (e) {
    if (missingTable(e)) return { rows: [], total: 0, byRole: {} };
    throw e;
  }
}
