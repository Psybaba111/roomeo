import type { Sql } from "../db.ts";
import { boardSummary, headcount, istDate, mealOpen, relistFrom, type BedInput, type Meal } from "./pg-ops.ts";

async function ownListing(sql: Sql, listingId: string, ownerId: string) {
  const l = (await sql<{ owner_id: string }>`select owner_id from listings where id = ${listingId}`)[0];
  if (!l || l.owner_id !== ownerId) throw new Error("That's not your listing.");
}

/** Listings where the user lives (confirmed move-in, or named on an occupied/on-notice bed). */
export async function residencies(sql: Sql, userId: string) {
  return sql<{ listing_id: string; title: string; owner_id: string }>`select distinct l.id as listing_id, l.title, l.owner_id from listings l
    where l.id in (select listing_id from move_ins where seeker_id = ${userId} and confirmed_at is not null
      union select listing_id from pg_beds where tenant_id = ${userId} and status in ('OCCUPIED','ON_NOTICE'))`;
}

async function residentCount(sql: Sql, listingId: string): Promise<number> {
  const beds = (await sql<{ n: number; total: number }>`select count(*) filter (where status in ('OCCUPIED','ON_NOTICE'))::int as n, count(*)::int as total from pg_beds where listing_id = ${listingId}`)[0];
  if (beds && Number(beds.total) > 0) return Number(beds.n);
  return Number((await sql<{ n: number }>`select count(distinct seeker_id)::int as n from move_ins where listing_id = ${listingId} and confirmed_at is not null`)[0]?.n ?? 0);
}

// ---------- Bed board ----------
export async function saveBed(sql: Sql, ownerId: string, listingId: string, bedId: string | null, b: BedInput, tenantUserId: string | null = null) {
  await ownListing(sql, listingId, ownerId);
  if (tenantUserId) {
    const ok = await sql`select 1 from move_ins where listing_id = ${listingId} and seeker_id = ${tenantUserId} and owner_id = ${ownerId} and confirmed_at is not null`;
    if (!ok.length) throw new Error("That resident hasn't moved in here on Roomeo.");
  }
  const tid = b.status === "VACANT" || b.status === "BLOCKED" ? null : tenantUserId;
  if (bedId) {
    const r = await sql`update pg_beds set label = ${b.label}, status = ${b.status}, tenant_name = ${b.tenantName}, move_in_date = ${b.moveInDate}::date, notice_end = ${b.noticeEnd}::date, note = ${b.note},
      tenant_id = case when ${b.status} in ('VACANT','BLOCKED') then null else coalesce(${tid}, tenant_id) end, updated_at = now()
      where id = ${bedId} and owner_id = ${ownerId} returning id`;
    if (!r.length) throw new Error("Bed not found.");
    return bedId;
  }
  const id = crypto.randomUUID();
  await sql`insert into pg_beds (id, listing_id, owner_id, label, status, tenant_id, tenant_name, move_in_date, notice_end, note)
    values (${id}, ${listingId}, ${ownerId}, ${b.label}, ${b.status}, ${tid}, ${b.tenantName}, ${b.moveInDate}::date, ${b.noticeEnd}::date, ${b.note})`;
  return id;
}

export async function deleteBed(sql: Sql, ownerId: string, bedId: string) {
  await sql`delete from pg_beds where id = ${bedId} and owner_id = ${ownerId}`;
}

/** One tap: put the listing back in search for a vacant / on-notice bed. Never un-pauses an admin-paused or removed listing. */
export async function relistBed(sql: Sql, ownerId: string, bedId: string, now: Date) {
  const b = (await sql<{ listing_id: string; status: string; notice_end: string | null }>`select listing_id, status, notice_end::text as notice_end from pg_beds where id = ${bedId} and owner_id = ${ownerId}`)[0];
  if (!b) throw new Error("Bed not found.");
  const from = relistFrom(b, istDate(now));
  if (!from) throw new Error("Only vacant or on-notice beds can be relisted.");
  const l = (await sql<{ status: string }>`select status from listings where id = ${b.listing_id}`)[0];
  if (!l || l.status === "REMOVED" || l.status === "PAUSED") throw new Error("This listing is paused or removed. Unpause it from the listing page first.");
  await sql`update listings set available_from = ${from}::date, status = case when status = 'OCCUPIED' then 'ACTIVE' else status end, updated_at = now() where id = ${b.listing_id}`;
  return { listingId: b.listing_id, availableFrom: from };
}

/** Owner board: every listing with its beds; seeds suggestions from confirmed move-ins that aren't on a bed yet. */
export async function bedBoard(sql: Sql, ownerId: string) {
  const listings = await sql<{ id: string; title: string; status: string; available_from: string }>`select id, title, status, available_from::text as available_from from listings where owner_id = ${ownerId} and status <> 'REMOVED' order by created_at desc limit 30`;
  const beds = await sql<{ id: string; listing_id: string; label: string; status: string; tenant_name: string; move_in_date: string | null; notice_end: string | null; note: string }>`
    select id, listing_id, label, status, tenant_name, move_in_date::text as move_in_date, notice_end::text as notice_end, note from pg_beds where owner_id = ${ownerId} order by label`;
  const unplaced = await sql<{ listing_id: string; user_id: string; name: string; since: string }>`select mi.listing_id, mi.seeker_id as user_id, coalesce(p.full_name, 'Resident') as name, (mi.confirmed_at at time zone 'Asia/Kolkata')::date::text as since
    from move_ins mi left join profiles p on p.user_id = mi.seeker_id where mi.owner_id = ${ownerId} and mi.confirmed_at is not null
      and not exists (select 1 from pg_beds b where b.tenant_id = mi.seeker_id and b.listing_id = mi.listing_id)`;
  return {
    summary: boardSummary(beds),
    listings: listings.map((l) => ({
      ...l,
      beds: beds.filter((b) => b.listing_id === l.id).map((b) => ({ id: b.id, label: b.label, status: b.status, tenantName: b.tenant_name, moveInDate: b.move_in_date, noticeEnd: b.notice_end, note: b.note })),
      unplaced: unplaced.filter((u) => u.listing_id === l.id).map((u) => ({ userId: u.user_id, name: u.name, since: u.since })),
    })),
  };
}

// ---------- Meals ----------
export async function setMealSkip(sql: Sql, userId: string, listingId: string, mealDate: string, meal: Meal, skip: boolean, now: Date) {
  if (!(await residencies(sql, userId)).some((r) => r.listing_id === listingId)) throw new Error("You can only skip meals at your own PG.");
  if (!mealOpen(mealDate, now)) throw new Error("Too late for that one. Changes lock at 11 AM on the day.");
  if (skip) await sql`insert into meal_optouts (user_id, listing_id, meal_date, meal) values (${userId}, ${listingId}, ${mealDate}::date, ${meal}) on conflict do nothing`;
  else await sql`delete from meal_optouts where user_id = ${userId} and meal_date = ${mealDate}::date and meal = ${meal}`;
}

export async function mySkips(sql: Sql, userId: string, from: string) {
  return sql<{ meal_date: string; meal: string }>`select meal_date::text as meal_date, meal from meal_optouts where user_id = ${userId} and meal_date >= ${from}::date order by meal_date`;
}

export async function ownerHeadcount(sql: Sql, ownerId: string, listingId: string, date: string) {
  await ownListing(sql, listingId, ownerId);
  const skips = await sql<{ meal: string; name: string }>`select o.meal, coalesce(p.full_name, 'Resident') as name from meal_optouts o left join profiles p on p.user_id = o.user_id
    where o.listing_id = ${listingId} and o.meal_date = ${date}::date order by name`;
  const residents = await residentCount(sql, listingId);
  return { date, residents, ...headcount(residents, skips), skipping: skips.map((s) => ({ meal: s.meal, name: s.name })) };
}

// ---------- Notices ----------
export async function postNotice(sql: Sql, ownerId: string, listingId: string, title: string, body: string, pinned: boolean) {
  await ownListing(sql, listingId, ownerId);
  const id = crypto.randomUUID();
  await sql`insert into house_notices (id, listing_id, owner_id, title, body, pinned) values (${id}, ${listingId}, ${ownerId}, ${title}, ${body}, ${pinned})`;
  const residents = await sql<{ user_id: string }>`select distinct seeker_id as user_id from move_ins where listing_id = ${listingId} and confirmed_at is not null
    union select tenant_id from pg_beds where listing_id = ${listingId} and tenant_id is not null`;
  for (const r of residents) {
    await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${r.user_id}, 'notice', ${`📢 ${title}`}, ${body.slice(0, 120)}, '/dashboard#notices')`;
  }
  return id;
}

export async function deleteNotice(sql: Sql, ownerId: string, id: string) {
  await sql`delete from house_notices where id = ${id} and owner_id = ${ownerId}`;
}

export async function markNoticeRead(sql: Sql, userId: string, id: string) {
  const n = (await sql<{ listing_id: string }>`select listing_id from house_notices where id = ${id}`)[0];
  if (!n || !(await residencies(sql, userId)).some((r) => r.listing_id === n.listing_id)) throw new Error("Notice not found.");
  await sql`insert into house_notice_reads (notice_id, user_id) values (${id}, ${userId}) on conflict do nothing`;
}

export async function noticesFor(sql: Sql, userId: string) {
  const mine = await residencies(sql, userId);
  const ids = mine.map((r) => r.listing_id);
  const resident = ids.length
    ? ((await sql.query(`select n.id, n.listing_id, n.title, n.body, n.pinned, n.created_at::text as created_at, l.title as pg, r.read_at::text as read_at
        from house_notices n join listings l on l.id = n.listing_id left join house_notice_reads r on r.notice_id = n.id and r.user_id = $1
        where n.listing_id = any($2) order by n.pinned desc, n.created_at desc limit 30`, [userId, ids])) as { id: string; listing_id: string; title: string; body: string; pinned: boolean; created_at: string; pg: string; read_at: string | null }[])
    : [];
  const posted = await sql<{ id: string; listing_id: string; title: string; body: string; pinned: boolean; created_at: string; pg: string; reads: number }>`
    select n.id, n.listing_id, n.title, n.body, n.pinned, n.created_at::text as created_at, l.title as pg, (select count(*)::int from house_notice_reads r where r.notice_id = n.id) as reads
    from house_notices n join listings l on l.id = n.listing_id where n.owner_id = ${userId} order by n.created_at desc limit 30`;
  return {
    residencies: mine,
    resident: resident.map((n) => ({ id: n.id, title: n.title, body: n.body, pinned: Boolean(n.pinned), createdAt: n.created_at, pg: n.pg, read: Boolean(n.read_at) })),
    posted: posted.map((n) => ({ id: n.id, listingId: n.listing_id, title: n.title, body: n.body, pinned: Boolean(n.pinned), createdAt: n.created_at, pg: n.pg, reads: Number(n.reads) })),
  };
}
