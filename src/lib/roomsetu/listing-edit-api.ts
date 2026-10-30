import { readTrust, writeTrust } from "@/lib/roomsetu/trust-db";
import { trustOf } from "@/lib/roomsetu/trust";
import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { audit } from "@/lib/roomsetu/admin-api";
import { bool, num, str } from "@/lib/roomsetu/map";
import { logEvent } from "@/lib/roomsetu/services";
import {
  EDIT_AMENITIES,
  canEditListing,
  editOf,
  editQuality,
  photosToDelete,
  validKeeps,
  type AmenityKey,
} from "@/lib/roomsetu/listing-edit";

function idOf(input: unknown): string {
  const id = (input as { id?: unknown } | undefined)?.id;
  if (typeof id !== "string" || !/^[0-9a-f-]{8,80}$/i.test(id)) throw new Error("Unknown room.");
  return id;
}

async function access(sql: Sql, listingId: string, userId: string) {
  const rows = await sql<{ owner_id: string }>`select owner_id from listings where id = ${listingId}`;
  if (!rows[0]) throw new Error("That room could not be found.");
  const profile = await sql<{ account_status: string }>`select account_status from profiles where user_id = ${userId}`;
  if (!profile[0]) throw new Error("Finish your profile to continue.");
  if (str(profile[0].account_status) === "SUSPENDED") throw new Error("This account is suspended.");
  const roles = (await sql<{ role: string }>`select role from profile_roles where user_id = ${userId}`).map((r) => r.role);
  const ownerId = str(rows[0].owner_id);
  if (!canEditListing(ownerId, userId, roles)) throw new Error("You can only edit your own room.");
  return { ownerId, asAdmin: ownerId !== userId };
}

export const getListingForEdit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: idOf(input) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { asAdmin } = await access(sql, data.id, context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select id, title, city_name, locality_name, monthly_rent, deposit, description, furnished,
              available_from::text as available_from, status,
              ${EDIT_AMENITIES.map((a) => a.column).join(", ")}
       from listings where id = $1`,
      [data.id],
    );
    const row = rows[0];
    const photos = await sql<{ id: string; url: string; category: string }>`
      select id, url, category from listing_images where listing_id = ${data.id} order by sort_order, id`;
    return {
      id: str(row.id),
      title: str(row.title),
      city: str(row.city_name),
      locality: str(row.locality_name),
      status: str(row.status),
      monthlyRent: num(row.monthly_rent),
      deposit: num(row.deposit),
      description: str(row.description),
      furnished: str(row.furnished),
      availableFrom: str(row.available_from).slice(0, 10),
      amenities: Object.fromEntries(EDIT_AMENITIES.map((a) => [a.key, bool(row[a.column])])) as Record<AmenityKey, boolean>,
      photos: photos.map((p) => ({ id: str(p.id), url: str(p.url), category: str(p.category) })),
      trust: await readTrust(sql, data.id),
      asAdmin,
    };
  });

export const updateListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const edit = editOf(input);
    return { ...edit, trust: trustOf(input, edit.monthlyRent) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { asAdmin } = await access(sql, data.id, context.userId);
    const existing = (await sql<{ id: string }>`select id from listing_images where listing_id = ${data.id} order by sort_order, id`).map((r) => str(r.id));
    const keep = validKeeps(existing, data.keepPhotoIds);
    if (keep.length + data.newPhotos.length < 1) throw new Error("Keep at least one photo.");
    const cols = EDIT_AMENITIES.map((a) => a.column);
    const params: unknown[] = [
      data.id,
      data.monthlyRent,
      data.deposit,
      data.description,
      data.furnished,
      data.availableFrom,
      editQuality(keep.length + data.newPhotos.length, data.description, data.furnished),
      ...EDIT_AMENITIES.map((a) => data.amenities[a.key]),
      String(data.monthlyRent),
    ];
    const rentText = `$${params.length}`;
    await sql.query(
      `update listings set monthly_rent = $2::int, deposit = $3::int, description = coalesce(nullif($4, ''), description),
         furnished = $5, available_from = $6::date, quality_score = $7,
         ${cols.map((c, i) => `${c} = $${i + 8}`).join(", ")},
         fingerprint = lower(city_name || '|' || locality_name || '|' || ${rentText}::text || '|' || room_type),
         updated_at = now()
       where id = $1`,
      params,
    );
    for (const gone of photosToDelete(existing, keep)) {
      await sql`delete from listing_images where id = ${gone} and listing_id = ${data.id}`;
    }
    for (let i = 0; i < keep.length; i++) {
      await sql`update listing_images set sort_order = ${i} where id = ${keep[i]} and listing_id = ${data.id}`;
    }
    for (let i = 0; i < data.newPhotos.length; i++) {
      const p = data.newPhotos[i];
      await sql`insert into listing_images (id, listing_id, url, category, sort_order) values (${crypto.randomUUID()}, ${data.id}, ${p.url}, ${p.category}, ${keep.length + i})`;
    }
    await writeTrust(sql, data.id, data.trust);
    await sql`delete from listing_amenities where listing_id = ${data.id}`;
    for (const a of EDIT_AMENITIES) {
      if (!a.amenity || !data.amenities[a.key]) continue;
      const am = await sql<{ id: string }>`select id from amenities where name = ${a.amenity}`;
      if (am[0]) await sql`insert into listing_amenities (listing_id, amenity_id) values (${data.id}, ${am[0].id}) on conflict do nothing`;
    }
    if (asAdmin) await audit(sql, context.userId, "listing.edit", "listing", data.id, `rent ${data.monthlyRent}, photos ${keep.length + data.newPhotos.length}`);
    logEvent("listing.edited", { admin: asAdmin, photos: keep.length + data.newPhotos.length });
    return { id: data.id };
  });
