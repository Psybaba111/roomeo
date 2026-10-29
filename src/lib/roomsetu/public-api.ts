import { readPhotoDates, readTrust } from "@/lib/roomsetu/trust-db";
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { badListingId, listingGone } from "@/lib/roomsetu/listing-gone";
import { listingCard, num, str, bool, type ListingCard } from "@/lib/roomsetu/map";
import { likeContains } from "@/lib/roomsetu/services";
import { areaCentroid, searchCity } from "@/lib/roomsetu/cities";

const CARD_SQL = `
  l.id, l.title, l.city_name, l.locality_name, l.monthly_rent, l.deposit, l.room_type, l.listing_kind, l.bedrooms,
  l.furnished, l.gender_pref, l.available_from::text as available_from,
  case when pr.identity_status = 'VERIFIED' and pr.phone_verified_at is not null then 'VERIFIED' else 'UNVERIFIED' end as verification_status,
  l.status, l.listing_tier, l.is_demo, (l.boosted_until is not null and l.boosted_until > now()) as boosted, l.food_available, l.quality_score,
  l.wifi, l.ac, l.pets_allowed, l.smoking_allowed, l.kitchen, l.guest_policy, l.occupation_pref,
  p.property_type,
  pr.full_name as host_name,
  (select i.url from listing_images i where i.listing_id = l.id order by i.sort_order limit 1) as photo
`;

const FROM = `
  from listings l
  join profiles pr on pr.user_id = l.owner_id
  join properties p on p.id = l.property_id
`;

export type SearchFilters = {
  city: string;
  locality: string;
  minRent: number | null;
  maxRent: number | null;
  maxDeposit: number | null;
  roomType: string;
  furnished: string;
  gender: string;
  occupation: string;
  food: boolean;
  wifi: boolean;
  ac: boolean;
  parking: boolean;
  entireFlat: boolean;
  availableBy: string;
  propertyType: string;
  sort: string;
  q: string;
};

function clean(v: unknown, max = 80): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function money(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function filters(input: unknown): SearchFilters {
  const o = (input ?? {}) as Record<string, unknown>;
  const sort = clean(o.sort, 20);
  const allowed = ["recommended", "rent_asc", "rent_desc", "newest", "nearest", "soon"];
  return {
    city: clean(o.city),
    locality: clean(o.locality),
    minRent: money(o.minRent),
    maxRent: money(o.maxRent),
    maxDeposit: money(o.maxDeposit),
    roomType: clean(o.roomType, 40),
    furnished: clean(o.furnished, 40),
    gender: clean(o.gender, 20),
    occupation: clean(o.occupation, 40),
    food: o.food === true,
    wifi: o.wifi === true,
    ac: o.ac === true,
    parking: o.parking === true,
    entireFlat: o.entireFlat === true,
    availableBy: /^\d{4}-\d{2}-\d{2}$/.test(clean(o.availableBy, 10)) ? clean(o.availableBy, 10) : "",
    propertyType: clean(o.propertyType, 40),
    sort: allowed.includes(sort) ? sort : "recommended",
    q: clean(o.q, 60),
  };
}

export const getHome = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ city: searchCity((input as { city?: unknown } | undefined)?.city) }))
  .handler(async ({ data }) => {
  const sql = await getSql();
  const city = data.city;
  const listings = await sql.query<Record<string, unknown>>(
    `select ${CARD_SQL} ${FROM}
     where l.status = 'ACTIVE' and pr.account_status = 'ACTIVE'
       and lower(l.city_name) = lower($1)
       and (l.is_demo = true or pr.identity_status = 'VERIFIED')
     order by case when l.boosted_until > now() then 0 else 1 end,
              case when l.listing_tier = 'FEATURED' then 0 when l.listing_tier = 'PREMIUM' then 1 else 2 end,
              case when l.verification_status = 'VERIFIED' then 0 else 1 end,
              l.quality_score desc
     limit 8`,
    [city],
  );
  const wanted = await sql.query<Record<string, unknown>>(
    `select id, display_name, age, occupation, city, localities, budget, bio, room_pref, is_demo, move_in::text as move_in
     from room_wanted where status = 'ACTIVE' and lower(city) = lower($1) order by created_at desc limit 4`,
    [city],
  );
  const cities = await sql.query<Record<string, unknown>>(
    `select c.name, c.state,
        count(l.id) filter (where l.status = 'ACTIVE' and pr.account_status = 'ACTIVE' and (l.is_demo = true or pr.identity_status = 'VERIFIED'))::int as rooms,
        (select count(*)::int from room_wanted w where w.city = c.name and w.status = 'ACTIVE') as people
     from cities c
     left join listings l on l.city_name = c.name
     left join profiles pr on pr.user_id = l.owner_id
     where c.name = $1
     group by c.name, c.state
     order by rooms desc, c.name`,
    [city],
  );
  const statsRow = await sql.query<Record<string, unknown>>(
    `select
       (select count(*)::int from listings where status = 'ACTIVE') as listings,
       (select count(*)::int from listings where status = 'ACTIVE' and verification_status = 'VERIFIED') as verified,
       (select count(*)::int from cities) as cities,
       (select count(*)::int from profiles where intent in ('LOOKING','BOTH') or user_id in (select user_id from room_wanted)) as seekers`,
  );
  const stats = statsRow[0] ?? {};
  return {
    city,
    listings: listings.map(listingCard),
    wanted: wanted.map((w) => ({
      id: str(w.id),
      name: str(w.display_name),
      age: num(w.age),
      occupation: str(w.occupation),
      city: str(w.city),
      localities: str(w.localities),
      budget: num(w.budget),
      bio: str(w.bio),
      roomPref: str(w.room_pref),
      moveIn: str(w.move_in).slice(0, 10),
      isDemo: bool(w.is_demo),
    })),
    cities: cities.map((c) => ({
      name: str(c.name),
      state: str(c.state),
      rooms: num(c.rooms),
      people: num(c.people),
    })),
    stats: {
      listings: num(stats.listings),
      verified: num(stats.verified),
      cities: num(stats.cities),
      seekers: num(stats.seekers),
    },
  };
  });

export const listCities = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const cities = await sql.query<Record<string, unknown>>(
    `select c.id, c.name, c.state, l.id as locality_id, l.name as locality
     from cities c
     left join localities l on l.city_id = c.id
     order by c.name, l.name`,
  );
  const map = new Map<string, { name: string; state: string; localities: string[] }>();
  for (const row of cities) {
    const name = str(row.name);
    const cur = map.get(name) ?? { name, state: str(row.state), localities: [] };
    if (row.locality) cur.localities.push(str(row.locality));
    map.set(name, cur);
  }
  return [...map.values()];
});

export const searchListings = createServerFn({ method: "POST" })
  .validator(filters)
  .handler(async ({ data }) => {
    const sql = await getSql();
    const where = ["l.status = 'ACTIVE'", "pr.account_status = 'ACTIVE'", "(l.is_demo = true or pr.identity_status = 'VERIFIED')", "lower(l.city_name) = lower($1)"];
    const params: unknown[] = [searchCity(data.city)];
    const add = (value: unknown, clause: string) => {
      params.push(value);
      where.push(clause.replaceAll("$#", `$${params.length}`));
    };
    if (data.locality) add(likeContains(data.locality), "lower(l.locality_name) like $# escape '\\'");
    if (data.minRent) add(data.minRent, "l.monthly_rent >= $#");
    if (data.maxRent) add(data.maxRent, "l.monthly_rent <= $#");
    if (data.maxDeposit) add(data.maxDeposit, "l.deposit <= $#");
    if (data.roomType) add(data.roomType, "l.room_type = $#");
    if (data.furnished) add(data.furnished, "l.furnished = $#");
    if (data.gender === "WOMEN" || data.gender === "MEN") add(data.gender, "l.gender_pref in ('ANY', $#)");
    if (data.occupation && data.occupation !== "ANY") add(data.occupation, "l.occupation_pref in ('ANY', $#)");
    if (data.food) where.push("l.food_available = true");
    if (data.entireFlat) where.push("l.listing_kind = 'ENTIRE_FLAT'");
    if (data.wifi) where.push("l.wifi = true");
    if (data.ac) where.push("l.ac = true");
    if (data.parking) where.push("l.parking = true");
    if (data.availableBy) add(data.availableBy, "l.available_from <= $#::date");
    if (data.propertyType) add(data.propertyType, "p.property_type = $#");
    if (data.q) add(likeContains(data.q), "(lower(l.title) like $# escape '\\' or lower(l.locality_name) like $# escape '\\' or lower(l.city_name) like $# escape '\\')");

    let order = `case when l.boosted_until > now() then 0 else 1 end, case when l.listing_tier = 'FEATURED' then 0 when l.listing_tier = 'PREMIUM' then 1 else 2 end, case when l.verification_status = 'VERIFIED' then 0 else 1 end, l.quality_score desc, l.created_at desc`;
    if (data.sort === "rent_asc") order = "l.monthly_rent asc, l.created_at desc";
    if (data.sort === "rent_desc") order = "l.monthly_rent desc";
    if (data.sort === "newest") order = "l.created_at desc";
    if (data.sort === "soon") order = "l.available_from asc, l.monthly_rent asc";
    if (data.sort === "nearest") {
      const coords = await sql.query<Record<string, unknown>>(
        "select lat, lng from cities where lower(name) = lower($1) limit 1",
        [searchCity(data.city)],
      );
      if (coords[0]) {
        params.push(num(coords[0].lat), num(coords[0].lng));
        order = `((p.lat - $${params.length - 1})^2 + (p.lng - $${params.length})^2) asc`;
      }
    }

    const rows = await sql.query<Record<string, unknown>>(
      `select ${CARD_SQL} ${FROM} where ${where.join(" and ")} order by ${order} limit 48`,
      params,
    );
    await sql.query(
      "insert into metric_events (id, kind, city) values ($1, 'search', $2)",
      [crypto.randomUUID(), searchCity(data.city)],
    );
    return { listings: rows.map(listingCard), total: rows.length };
  });

export const getListing = createServerFn({ method: "POST" })
  .middleware([
    createMiddleware({ type: "function" })
      .client(async ({ next }) => {
        const { getBearerToken } = await import("@/lib/auth/client");
        return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
      })
      .server(async ({ next, context }) => {
        const { getSessionUser } = await import("@/lib/auth/verify.server");
        const token = typeof context.bearerToken === "string" ? context.bearerToken : undefined;
        const user = await getSessionUser(token).catch(() => null);
        return next({ context: { userId: user?.id ?? null } });
      }),
  ])
  .validator((input: unknown) => {
    if (badListingId(input)) throw notFound();
    return input as string;
  })
  .handler(async ({ data: id, context }) => {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select l.*, l.available_from::text as available_from,
              p.property_type, p.lat, p.lng, p.verification_status as property_verification,
              pr.full_name as host_name, pr.occupation as host_occupation, pr.about as host_about,
              pr.verification_status as host_verification, pr.identity_status as host_identity, pr.identity_source as host_identity_source, pr.phone_verified_at as host_phone_verified_at, pr.city as host_city,
              pr.show_occupation, pr.show_city, pr.is_demo as host_demo,
              to_char(pr.created_at at time zone 'UTC', 'YYYY-MM') as host_since,
              pr.last_seen::text as host_seen, pr.account_status
       ${FROM}
       where l.id = $1 and l.status <> 'REMOVED'`,
      [id],
    );
    const row = rows[0];
    // Missing / REMOVED / suspended owner: a clean 404, not a thrown Error (which SSR turned into a 500).
    if (listingGone(row)) throw notFound();
    const visible = bool(row.is_demo) || bool(row.host_demo) || str(row.host_identity) === "VERIFIED";
    const isOwner = Boolean(context.userId && context.userId === str(row.owner_id));
    if (!visible && !isOwner) {
      return { held: true as const };
    }
    await sql.query("update listings set views = views + 1 where id = $1", [id]);
    const images = await sql.query<Record<string, unknown>>(
      "select url, category from listing_images where listing_id = $1 order by sort_order",
      [id],
    );
    const amenities = await sql.query<Record<string, unknown>>(
      `select a.name from listing_amenities la join amenities a on a.id = la.amenity_id
       where la.listing_id = $1 order by a.name`,
      [id],
    );
    const card = listingCard({ ...row, photo: images[0] ? str(images[0].url) : null });
    const [trust, photoDates] = await Promise.all([readTrust(sql, id), readPhotoDates(sql, id)]);
    return {
      held: false as const,
      onlyYou: !visible,
      ...card,
      verification: str(row.host_identity) === "VERIFIED" && row.host_phone_verified_at ? "VERIFIED" : "UNVERIFIED",
      description: str(row.description),
      views: num(row.views) + 1,
      minStay: num(row.min_stay_months),
      maxStay: row.max_stay_months == null ? null : num(row.max_stay_months),
      occupants: num(row.occupants),
      attachedBath: bool(row.attached_bath),
      balcony: bool(row.balcony),
      ac: bool(row.ac),
      wifi: bool(row.wifi),
      kitchen: bool(row.kitchen),
      washingMachine: bool(row.washing_machine),
      parking: bool(row.parking),
      powerBackup: bool(row.power_backup),
      lift: bool(row.lift),
      housekeeping: bool(row.housekeeping),
      smoking: bool(row.smoking_allowed),
      pets: bool(row.pets_allowed),
      guestPolicy: str(row.guest_policy),
      agePref: str(row.age_pref),
      occupationPref: str(row.occupation_pref),
      roommatePref: str(row.roommate_pref),
      kind: str(row.listing_kind) || "BED",
      bedrooms: num(row.bedrooms),
      ownerId: str(row.owner_id),
      lat: num(row.lat),
      lng: num(row.lng),
      images: images.map((img) => ({ url: str(img.url), category: str(img.category), uploadedAt: photoDates.get(str(img.url)) ?? "" })),
      trust: { allInInr: trust.allInInr, allInIncludes: trust.allInIncludes, videoTourUrl: trust.videoTourUrl, depositRefundDays: trust.depositRefundDays },
      amenities: amenities.map((a) => str(a.name)),
      host: {
        name: str(row.host_name),
        occupation: bool(row.show_occupation) ? str(row.host_occupation) : "",
        city: bool(row.show_city) ? str(row.host_city) : "",
        about: str(row.host_about).slice(0, 320),
        verified: str(row.host_identity) === "VERIFIED" && Boolean(row.host_phone_verified_at),
        identitySource: str(row.host_identity_source),
        since: str(row.host_since),
        lastSeen: str(row.host_seen),
        isDemo: bool(row.host_demo),
      },
      propertyVerified: str(row.property_verification) === "VERIFIED",
    };
  });

export const listRoomWanted = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const o = (input ?? {}) as Record<string, unknown>;
    return { city: clean(o.city), q: clean(o.q, 60) };
  })
  .handler(async ({ data }) => {
    const sql = await getSql();
    const params: unknown[] = [];
    const where = ["w.status = 'ACTIVE'", "pr.account_status = 'ACTIVE'"];
    if (data.city) {
      params.push(data.city.toLowerCase());
      where.push(`lower(w.city) = $${params.length}`);
    }
    if (data.q) {
      params.push(likeContains(data.q));
      where.push(`(lower(w.bio) like $${params.length} escape '\\' or lower(w.occupation) like $${params.length} escape '\\' or lower(w.localities) like $${params.length} escape '\\')`);
    }
    const rows = await sql.query<Record<string, unknown>>(
      `select w.id, w.display_name, w.age, w.gender, w.occupation, w.city, w.localities, w.budget,
              w.move_in::text as move_in, w.duration_months, w.room_pref, w.furnished_pref, w.food_pref,
              w.smoking_pref, w.bio, w.lifestyle, w.is_demo, w.people_count, w.roommate_gender
       from room_wanted w
       join profiles pr on pr.user_id = w.user_id
       where ${where.join(" and ")}
       order by w.created_at desc
       limit 40`,
      params,
    );
    return rows.map((w) => ({
      id: str(w.id),
      name: str(w.display_name),
      age: num(w.age),
      gender: str(w.gender),
      occupation: str(w.occupation),
      city: str(w.city),
      localities: str(w.localities),
      budget: num(w.budget),
      moveIn: str(w.move_in).slice(0, 10),
      duration: num(w.duration_months),
      roomPref: str(w.room_pref),
      furnished: str(w.furnished_pref),
      food: str(w.food_pref),
      smoking: str(w.smoking_pref),
      bio: str(w.bio),
      lifestyle: str(w.lifestyle),
      isDemo: bool(w.is_demo),
      people: num(w.people_count),
      roommateGender: str(w.roommate_gender),
      userId: "",
    }));
  });

export type { ListingCard };

/** Locality centroids for the area-level map. Never property coordinates. */
export const listAreaCentroids = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ city: searchCity((input as { city?: unknown } | undefined)?.city) }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select l.name, l.lat, l.lng from localities l join cities c on c.id = l.city_id where c.name = $1`,
      [data.city],
    );
    return rows.map((r) => {
      const name = str(r.name);
      const [lat, lng] = areaCentroid(data.city, name, [num(r.lat), num(r.lng)]);
      return { name, lat, lng };
    });
  });
