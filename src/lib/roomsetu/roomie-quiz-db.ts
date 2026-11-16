// DB side of the roomie quiz. Relative imports so it runs under node tests (PGlite).
// Every read tolerates a database that has not run migration 0028 yet (production until it is
// applied by hand): a missing table means "no types yet", never a broken page.
import type { Sql } from "../db.ts";
import { cleanAnswers, isRoomieType, ROOMIE_QUIZ_VERSION, roomieTypeFor, type RoomieAnswers, type RoomieTypeKey } from "./roomie-quiz.ts";
import { roomMatch, type RoomMatch } from "./roomie-match.ts";
import { DEFAULT_MATCH_CONFIG, type RoomieMatchConfig } from "./roomie-match-config.ts";

export const ROOMIE_TABLE_MISSING = "The roomie quiz isn't switched on here yet.";

function missingTable(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return err?.code === "42P01" || /relation "?roomie_(profiles|match_signals)"? does not exist/i.test(String(err?.message ?? ""));
}

function parseAnswers(v: unknown): RoomieAnswers {
  try {
    return cleanAnswers(typeof v === "string" ? JSON.parse(v) : v);
  } catch {
    return {};
  }
}

/**
 * People living in listing $1 right now, with when their stay started. Current = an OCCUPIED / ON_NOTICE bed
 * on the owner's bed board, or a confirmed move-in (1:1 or squad) with no move-out recorded.
 */
const OCCUPANTS_CTE = `occupants_raw as (
    select b.tenant_id as user_id, coalesce(b.move_in_date::timestamptz, b.created_at) as since from pg_beds b
      where b.listing_id = $1 and b.tenant_id is not null and b.status in ('OCCUPIED', 'ON_NOTICE')
    union all
    select m.seeker_id, m.confirmed_at from move_ins m
      where m.listing_id = $1 and m.confirmed_at is not null
        and not exists (select 1 from deal_agreements d where d.listing_id = m.listing_id and d.seeker_id = m.seeker_id and d.vacated_on is not null)
    union all
    select c.user_id, s.confirmed_at from squad_move_ins s join squad_move_in_confirms c on c.squad_move_in_id = s.id
      where s.listing_id = $1 and s.confirmed_at is not null
  ),
  occupants as (select user_id, min(since) as since from occupants_raw group by user_id)`;

/** True once migration 0028 is applied. Lets flag-off paths skip roomie queries entirely (no Postgres errors). */
export async function roomieTablesReady(sql: Sql): Promise<boolean> {
  const rows = await sql.query<{ ok: boolean }>(`select to_regclass('public.roomie_profiles') is not null as ok`);
  return rows[0]?.ok === true;
}

export type MyRoomie = { type: RoomieTypeKey; answers: RoomieAnswers; savedAt: string } | null;

/** The caller's own saved result (answers included: only ever returned to their owner). */
export async function readMyRoomie(sql: Sql, userId: string): Promise<MyRoomie> {
  try {
    const rows = await sql.query<Record<string, unknown>>(
      `select type_key, answers, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as saved_at
       from roomie_profiles where user_id = $1`,
      [userId],
    );
    const r = rows[0];
    if (!r || !isRoomieType(r.type_key)) return null;
    return { type: r.type_key, answers: parseAnswers(r.answers), savedAt: String(r.saved_at ?? "") };
  } catch (e) {
    if (missingTable(e)) return null;
    throw e;
  }
}

/**
 * Save after explicit consent. The type is recomputed from the answers here; the client never sends it.
 * Throws without consent or with an incomplete answer set.
 */
export async function saveRoomie(sql: Sql, userId: string, rawAnswers: unknown, consent: unknown): Promise<RoomieTypeKey> {
  if (consent !== true) throw new Error("Tick the consent box to save your answers.");
  const answers = cleanAnswers(rawAnswers);
  const type = roomieTypeFor(answers);
  try {
    await sql.query(
      `insert into roomie_profiles (user_id, type_key, answers, quiz_version, consent_at)
       values ($1, $2, $3::jsonb, $4, now())
       on conflict (user_id) do update set type_key = excluded.type_key, answers = excluded.answers,
         quiz_version = excluded.quiz_version, consent_at = now(), updated_at = now()`,
      [userId, type, JSON.stringify(answers), ROOMIE_QUIZ_VERSION],
    );
  } catch (e) {
    if (missingTable(e)) throw new Error(ROOMIE_TABLE_MISSING);
    throw e;
  }
  return type;
}

/** Hard delete of answers and type. Returns whether a row existed. */
export async function deleteRoomie(sql: Sql, userId: string): Promise<boolean> {
  try {
    const rows = await sql.query<{ user_id: string }>(`delete from roomie_profiles where user_id = $1 returning user_id`, [userId]);
    // Signals hold the type (not answers); they go too.
    await sql.query(`delete from roomie_match_signals where tenant_id = $1`, [userId]).catch((e: unknown) => {
      if (!missingTable(e)) throw e;
    });
    return rows.length > 0;
  } catch (e) {
    if (missingTable(e)) return false;
    throw e;
  }
}

/** Type key per user id (types only, never answers). Used for hosts reviewing their own requests. */
export async function typesForUsers(sql: Sql, userIds: string[]): Promise<Map<string, RoomieTypeKey>> {
  const out = new Map<string, RoomieTypeKey>();
  const ids = [...new Set(userIds.filter((s) => typeof s === "string" && s))];
  if (!ids.length) return out;
  try {
    const rows = await sql.query<Record<string, unknown>>(`select user_id, type_key from roomie_profiles where user_id = any($1::text[])`, [ids]);
    for (const r of rows) if (isRoomieType(r.type_key)) out.set(String(r.user_id), r.type_key);
  } catch (e) {
    if (!missingTable(e)) throw e;
  }
  return out;
}

/** Counts per type for the people living in a listing right now. Only aggregate counts leave the database. */
export async function occupantTypeCounts(sql: Sql, listingId: string): Promise<Partial<Record<RoomieTypeKey, number>>> {
  try {
    const rows = await sql.query<Record<string, unknown>>(
      `with ${OCCUPANTS_CTE}
       select r.type_key, count(*)::int as n from occupants o join roomie_profiles r on r.user_id = o.user_id group by r.type_key`,
      [listingId],
    );
    const out: Partial<Record<RoomieTypeKey, number>> = {};
    for (const r of rows) if (isRoomieType(r.type_key)) out[r.type_key] = Number(r.n) || 0;
    return out;
  } catch (e) {
    if (missingTable(e)) return {};
    throw e;
  }
}

/** Server-only: answer sets of the current occupants (minus `excludeUserId`). Never returned to a client. */
async function occupantAnswers(sql: Sql, listingId: string, excludeUserId: string): Promise<RoomieAnswers[]> {
  const rows = await sql.query<Record<string, unknown>>(
    `with ${OCCUPANTS_CTE}
     select r.answers from occupants o join roomie_profiles r on r.user_id = o.user_id where o.user_id <> $2`,
    [listingId, excludeUserId],
  );
  return rows.map((r) => parseAnswers(r.answers));
}

/**
 * Vibe match between a seeker and a listing's current occupants (the seeker excluded).
 * null when the seeker has no quiz, or no occupant has one (the badge is hidden).
 */
export async function vibeMatchFor(sql: Sql, listingId: string, seekerId: string, cfg: RoomieMatchConfig = DEFAULT_MATCH_CONFIG): Promise<RoomMatch> {
  try {
    const mine = await sql.query<Record<string, unknown>>(`select answers from roomie_profiles where user_id = $1`, [seekerId]);
    if (!mine[0]) return null;
    return roomMatch(parseAnswers(mine[0].answers), await occupantAnswers(sql, listingId, seekerId), cfg);
  } catch (e) {
    if (missingTable(e)) return null;
    throw e;
  }
}

/**
 * Success signals for tuning: for each current occupant with a saved type whose stay started 60+ days ago,
 * write one STAY_60 row (once per tenant per listing) with their score against the other occupants now.
 * Cheap and idempotent; safe to call opportunistically. Returns how many rows were added.
 */
export async function recordStaySignals(sql: Sql, listingId: string, cfg: RoomieMatchConfig = DEFAULT_MATCH_CONFIG, now: Date = new Date()): Promise<number> {
  try {
    const due = await sql.query<Record<string, unknown>>(
      `with ${OCCUPANTS_CTE}
       select o.user_id, r.type_key, o.since from occupants o join roomie_profiles r on r.user_id = o.user_id
       where o.since <= $2::timestamptz - interval '60 days'
         and not exists (select 1 from roomie_match_signals g where g.kind = 'STAY_60' and g.listing_id = $1 and g.tenant_id = o.user_id)`,
      [listingId, now.toISOString()],
    );
    let added = 0;
    for (const r of due) {
      const tenant = String(r.user_id);
      const m = await vibeMatchFor(sql, listingId, tenant, cfg);
      const rows = await sql.query(
        `insert into roomie_match_signals (id, kind, listing_id, tenant_id, tenant_type, score, rule_out, occupants_n, config_version, stay_started_at)
         values ($1, 'STAY_60', $2, $3, $4, $5, $6, $7, $8, $9) on conflict (kind, listing_id, tenant_id) do nothing returning id`,
        [crypto.randomUUID(), listingId, tenant, String(r.type_key), m?.score ?? null, m?.ruleOut ?? false, m?.pairs ?? 0, cfg.version, r.since],
      );
      added += rows.length;
    }
    return added;
  } catch (e) {
    if (missingTable(e)) return 0;
    throw e;
  }
}

/** Same occupant rules as OCCUPANTS_CTE, for many listings at once ($1 = text[] of listing ids). */
const MULTI_OCCUPANTS_CTE = `occupants_raw as (
    select b.listing_id, b.tenant_id as user_id from pg_beds b
      where b.listing_id = any($1::text[]) and b.tenant_id is not null and b.status in ('OCCUPIED', 'ON_NOTICE')
    union all
    select m.listing_id, m.seeker_id from move_ins m
      where m.listing_id = any($1::text[]) and m.confirmed_at is not null
        and not exists (select 1 from deal_agreements d where d.listing_id = m.listing_id and d.seeker_id = m.seeker_id and d.vacated_on is not null)
    union all
    select s.listing_id, c.user_id from squad_move_ins s join squad_move_in_confirms c on c.squad_move_in_id = s.id
      where s.listing_id = any($1::text[]) and s.confirmed_at is not null
  ),
  occupants as (select distinct listing_id, user_id from occupants_raw)`;

export type VibeScores = Record<string, { score: number; ruleOut: boolean }>;

/**
 * Vibe match scores for many listings (search "Vibe match" sort). Uses only the seeker's SAVED answers, never
 * client-supplied ones, so scores can't be used to probe occupants' answers. Listings with no typed occupants
 * are left out. hasQuiz=false when the seeker hasn't saved a quiz (or 0028 isn't applied).
 */
export async function vibeScoresFor(sql: Sql, listingIds: string[], seekerId: string, cfg: RoomieMatchConfig = DEFAULT_MATCH_CONFIG): Promise<{ hasQuiz: boolean; scores: VibeScores }> {
  try {
    const mine = await sql.query<Record<string, unknown>>(`select answers from roomie_profiles where user_id = $1`, [seekerId]);
    if (!mine[0]) return { hasQuiz: false, scores: {} };
    const seeker = parseAnswers(mine[0].answers);
    if (!listingIds.length) return { hasQuiz: true, scores: {} };
    const rows = await sql.query<Record<string, unknown>>(
      `with ${MULTI_OCCUPANTS_CTE}
       select o.listing_id, r.answers from occupants o join roomie_profiles r on r.user_id = o.user_id where o.user_id <> $2`,
      [listingIds, seekerId],
    );
    const by = new Map<string, RoomieAnswers[]>();
    for (const r of rows) {
      const id = String(r.listing_id);
      by.set(id, [...(by.get(id) ?? []), parseAnswers(r.answers)]);
    }
    const scores: VibeScores = {};
    for (const [id, occ] of by) {
      const m = roomMatch(seeker, occ, cfg);
      if (m) scores[id] = { score: m.score, ruleOut: m.ruleOut };
    }
    return { hasQuiz: true, scores };
  } catch (e) {
    if (missingTable(e)) return { hasQuiz: false, scores: {} };
    throw e;
  }
}
