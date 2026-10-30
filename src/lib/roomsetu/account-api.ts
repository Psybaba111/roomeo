import { audit } from "@/lib/roomsetu/admin-api";
import { trustOf, type TrustFields } from "@/lib/roomsetu/trust";
import { writeTrust } from "@/lib/roomsetu/trust-db";
import { createServerFn } from "@tanstack/react-start";
import { legacyPlanRejection } from "@/lib/roomsetu/legacy-plans";
import QRCode from "qrcode";
import { hitLimit } from "@/lib/roomsetu/rate-limit";
import { notifyWhatsApp } from "@/lib/roomsetu/mappstore";
import { canPublish } from "@/lib/roomsetu/otp";
import { assertContactAllowed, markContactRefundDue } from "@/lib/roomsetu/squad-api";
import { contactRefundDue } from "@/lib/roomsetu/contact";
import {
  buildUpiLink,
  makeRef,
  planCodeSchema,
  submitUtrInput,
  upiPayee,
} from "@/lib/roomsetu/upi";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { listingCard, bool, num, str } from "@/lib/roomsetu/map";
import { scoreMatch, type SeekerFacts } from "@/lib/roomsetu/match";
import { rentQuote } from "@/lib/roomsetu/money";
import { photoUrlError, logEvent } from "@/lib/roomsetu/services";
import {
  FURNISHED,
  GENDER_PREFS,
  OCCUPATION_PREFS,
  PROPERTY_TYPES,
  REPORT_CATEGORIES,
  ROOM_TYPES,
} from "@/lib/roomsetu/constants";

async function verifiedPhone(sql: Sql, userId: string): Promise<string | null> {
  const rows = await sql<{
    phone_e164: string | null;
  }>`select phone_e164 from profiles where user_id = ${userId} and phone_verified_at is not null`;
  return rows[0]?.phone_e164 ?? null;
}

async function requirePublishable(sql: Sql, userId: string) {
  const rows = await sql<{ identity_status: string; phone_verified_at: string | null }>`
    select identity_status, phone_verified_at from profiles where user_id = ${userId}`;
  const row = rows[0];
  if (
    !row ||
    !canPublish({
      identityStatus: str(row.identity_status),
      phoneVerified: Boolean(row.phone_verified_at),
    })
  ) {
    throw new Error("Verify your phone and ID on the Verification page before publishing a bed.");
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function text(v: unknown, max: number, label: string, required = false): string {
  const value = typeof v === "string" ? v.trim().slice(0, max) : "";
  if (required && value.length < 2) throw new Error(`${label} is required.`);
  return value;
}

function listingKey(v: unknown): string {
  if (typeof v !== "string" || !/^[0-9a-f-]{8,80}$/i.test(v)) throw new Error("Unknown room.");
  return v;
}

async function rolesOf(sql: Sql, userId: string) {
  const rows = await sql<{
    role: string;
  }>`select role from profile_roles where user_id = ${userId}`;
  return rows.map((r) => r.role);
}

async function requireProfile(sql: Sql, userId: string) {
  const rows = await sql<Record<string, unknown>>`select * from profiles where user_id = ${userId}`;
  const row = rows[0];
  if (!row) throw new Error("Finish your profile to continue.");
  if (str(row.account_status) === "SUSPENDED") throw new Error("This account is suspended.");
  return row;
}

function viewProfile(row: Record<string, unknown>, roles: string[]) {
  const move = str(row.move_in);
  return {
    userId: str(row.user_id),
    name: str(row.full_name),
    mobile: str(row.mobile),
    age: row.age == null ? null : num(row.age),
    gender: str(row.gender),
    city: str(row.city),
    occupation: str(row.occupation),
    intent: str(row.intent),
    preferredCities: str(row.preferred_cities),
    about: str(row.about),
    lifestyle: str(row.lifestyle),
    smoking: str(row.smoking),
    pets: str(row.pets),
    food: str(row.food),
    budget: row.budget == null ? null : num(row.budget),
    moveIn: move ? move.slice(0, 10) : "",
    roomPref: str(row.room_pref),
    furnishedPref: str(row.furnished_pref),
    showAge: bool(row.show_age),
    showOccupation: bool(row.show_occupation),
    showCity: bool(row.show_city),
    allowMessages: str(row.allow_messages) || "EVERYONE",
    verification: str(row.verification_status),
    accountStatus: str(row.account_status),
    roles,
    isDemo: bool(row.is_demo),
  };
}

function seekerFrom(
  profile: Record<string, unknown>,
  wanted?: Record<string, unknown>,
): SeekerFacts {
  return {
    city: str(wanted?.city || profile.city),
    localities: str(wanted?.localities || ""),
    budget:
      wanted?.budget != null
        ? num(wanted.budget)
        : profile.budget == null
          ? null
          : num(profile.budget),
    moveIn: str(wanted?.move_in || profile.move_in).slice(0, 10),
    roomPref: str(wanted?.room_pref || profile.room_pref),
    gender: str(profile.gender),
    roommateGender: str(wanted?.roommate_gender || "ANY"),
    occupation: str(wanted?.occupation || profile.occupation),
    smoking: str(wanted?.smoking_pref || profile.smoking),
    pets: str(wanted?.pet_pref || profile.pets),
    food: str(wanted?.food_pref || profile.food),
  };
}

export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const intent = str(asRecord(input).intent);
    return {
      intent: intent === "LOOKING" || intent === "OFFERING" || intent === "BOTH" ? intent : "BOTH",
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const userId = context.userId;
    const existing = await sql`select user_id from profiles where user_id = ${userId}`;
    if (!existing.length) {
      const auth = await sql<{ name: string }>`select name from "user" where id = ${userId}`;
      const name = auth[0]?.name?.trim() || "New member";
      await sql`insert into profiles (user_id, full_name, intent) values (${userId}, ${name}, ${data.intent})`;
      if (data.intent !== "OFFERING") {
        await sql`insert into profile_roles (user_id, role) values (${userId}, 'SEEKER') on conflict do nothing`;
      }
      if (data.intent !== "LOOKING") {
        await sql`insert into profile_roles (user_id, role) values (${userId}, 'HOST') on conflict do nothing`;
      }
    }
    const row = await requireProfile(sql, userId);
    return viewProfile(row, await rolesOf(sql, userId));
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const age = o.age == null || o.age === "" ? null : num(o.age);
    if (age != null && (age < 18 || age > 80))
      throw new Error("Age needs to be between 18 and 80.");
    const budget = o.budget == null || o.budget === "" ? null : num(o.budget);
    if (budget != null && (budget < 1000 || budget > 500000)) throw new Error("Budget looks off.");
    const mobile = text(o.mobile, 16, "Mobile");
    if (mobile && !/^[0-9+\-\s]{10,16}$/.test(mobile))
      throw new Error("Enter a mobile number with at least 10 digits.");
    const gender = text(o.gender, 20, "Gender");
    const intent = text(o.intent, 20, "Intent");
    return {
      name: text(o.name, 80, "Name", true),
      mobile,
      age,
      gender: ["F", "M", "OTHER", ""].includes(gender) ? gender : "",
      city: text(o.city, 60, "City"),
      occupation: text(o.occupation, 80, "Occupation"),
      intent: intent === "LOOKING" || intent === "OFFERING" || intent === "BOTH" ? intent : "BOTH",
      preferredCities: text(o.preferredCities, 160, "Cities"),
      about: text(o.about, 600, "About"),
      lifestyle: text(o.lifestyle, 300, "Lifestyle"),
      smoking: text(o.smoking, 20, "Smoking") || "NO",
      pets: text(o.pets, 20, "Pets") || "NO",
      food: text(o.food, 20, "Food") || "ANY",
      budget,
      moveIn: /^\d{4}-\d{2}-\d{2}$/.test(text(o.moveIn, 10, "Date"))
        ? text(o.moveIn, 10, "Date")
        : "",
      roomPref: text(o.roomPref, 40, "Room"),
      furnishedPref: text(o.furnishedPref, 40, "Furnished"),
      showAge: o.showAge !== false,
      showOccupation: o.showOccupation !== false,
      showCity: o.showCity !== false,
      allowMessages: text(o.allowMessages, 20, "Messages") === "NONE" ? "NONE" : "EVERYONE",
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    await sql.query(
      `update profiles set full_name=$2, mobile=$3, age=$4, gender=$5, city=$6, occupation=$7, intent=$8,
        preferred_cities=$9, about=$10, lifestyle=$11, smoking=$12, pets=$13, food=$14, budget=$15,
        move_in=$16, room_pref=$17, furnished_pref=$18, show_age=$19, show_occupation=$20, show_city=$21,
        allow_messages=$22, updated_at=now()
       where user_id=$1`,
      [
        context.userId,
        data.name,
        data.mobile || null,
        data.age,
        data.gender || null,
        data.city || null,
        data.occupation || null,
        data.intent,
        data.preferredCities,
        data.about,
        data.lifestyle,
        data.smoking,
        data.pets,
        data.food,
        data.budget,
        data.moveIn || null,
        data.roomPref || null,
        data.furnishedPref || null,
        data.showAge,
        data.showOccupation,
        data.showCity,
        data.allowMessages,
      ],
    );
    if (data.intent !== "OFFERING") {
      await sql`insert into profile_roles (user_id, role) values (${context.userId}, 'SEEKER') on conflict do nothing`;
    }
    if (data.intent !== "LOOKING") {
      await sql`insert into profile_roles (user_id, role) values (${context.userId}, 'HOST') on conflict do nothing`;
    }
    return viewProfile(
      await requireProfile(sql, context.userId),
      await rolesOf(sql, context.userId),
    );
  });

const CARD = `
  l.id, l.title, l.city_name, l.locality_name, l.monthly_rent, l.deposit, l.room_type, l.furnished,
  l.gender_pref, l.available_from::text as available_from, case when pr.identity_status = 'VERIFIED' and pr.phone_verified_at is not null then 'VERIFIED' else 'UNVERIFIED' end as verification_status, l.status, l.listing_tier,
  l.is_demo, l.food_available, l.quality_score, l.views, l.wifi, l.ac, l.pets_allowed, l.smoking_allowed, l.kitchen, l.guest_policy, l.occupation_pref, p.property_type, pr.full_name as host_name,
  (select i.url from listing_images i where i.listing_id = l.id order by i.sort_order limit 1) as photo
`;

export const getDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const userId = context.userId;
    const row = await requireProfile(sql, userId);
    await sql`update profiles set last_seen = now() where user_id = ${userId}`;
    const roles = await rolesOf(sql, userId);
    const mine = await sql.query<Record<string, unknown>>(
      `select ${CARD}
       from listings l
       join profiles pr on pr.user_id = l.owner_id
       join properties p on p.id = l.property_id
       where l.owner_id = $1 and l.status <> 'REMOVED'
       order by l.created_at desc`,
      [userId],
    );
    const wanted = await sql.query<Record<string, unknown>>(
      `select id, display_name, city, localities, budget, room_pref, bio, status, is_demo, move_in::text as move_in
       from room_wanted where user_id = $1 and status <> 'REMOVED' order by created_at desc`,
      [userId],
    );
    const saved = await sql<{
      n: number;
    }>`select count(*)::int as n from saved_listings where user_id = ${userId}`;
    const apps = await sql<{
      n: number;
    }>`select count(*)::int as n from applications where seeker_id = ${userId} or host_id = ${userId}`;
    const unread = await sql<{ n: number }>`
      select count(*)::int as n from messages m
      join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = ${userId}
      where m.sender_id <> ${userId} and m.created_at > coalesce(cm.last_read_at, '1970-01-01')`;
    const notes = await sql.query<Record<string, unknown>>(
      `select id, title, body, href, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as at
       from notifications where user_id = $1 order by created_at desc limit 8`,
      [userId],
    );
    const facts = seekerFrom(row, wanted[0]);
    const recommended = (
      await sql.query<Record<string, unknown>>(
        `select l.id, l.city_name, l.locality_name, l.monthly_rent, l.available_from::text as available_from,
              l.room_type, l.gender_pref, l.occupation_pref, l.smoking_allowed, l.pets_allowed, l.food_available,
              l.title, l.deposit, l.furnished, case when pr.identity_status = 'VERIFIED' and pr.phone_verified_at is not null then 'VERIFIED' else 'UNVERIFIED' end as verification_status, l.status, l.listing_tier, l.is_demo,
              l.quality_score, p.property_type, pr.full_name as host_name,
              (select i.url from listing_images i where i.listing_id = l.id order by i.sort_order limit 1) as photo
       from listings l
       join profiles pr on pr.user_id = l.owner_id
       join properties p on p.id = l.property_id
       where l.status = 'ACTIVE' and l.owner_id <> $1 and pr.account_status = 'ACTIVE'
         and (l.is_demo = true or pr.identity_status = 'VERIFIED')
       limit 80`,
        [userId],
      )
    )
      .map((listing) => ({
        card: listingCard(listing),
        match: scoreMatch(
          {
            city: str(listing.city_name),
            locality: str(listing.locality_name),
            rent: num(listing.monthly_rent),
            availableFrom: str(listing.available_from),
            roomType: str(listing.room_type),
            genderPref: str(listing.gender_pref),
            occupationPref: str(listing.occupation_pref),
            smokingAllowed: bool(listing.smoking_allowed),
            petsAllowed: bool(listing.pets_allowed),
            foodAvailable: bool(listing.food_available),
          },
          facts,
        ),
      }))
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 4);
    const fields = [
      row.full_name,
      row.age,
      row.gender,
      row.city,
      row.occupation,
      row.about,
      row.budget || mine.length || wanted.length,
    ];
    const completion = Math.round((fields.filter(Boolean).length / fields.length) * 100);
    return {
      profile: viewProfile(row, roles),
      listings: mine.map((m) => ({ ...listingCard(m), views: num(m.views) })),
      wanted: wanted.map((w) => ({
        id: str(w.id),
        name: str(w.display_name),
        city: str(w.city),
        localities: str(w.localities),
        budget: num(w.budget),
        roomPref: str(w.room_pref),
        bio: str(w.bio),
        status: str(w.status),
        moveIn: str(w.move_in).slice(0, 10),
        isDemo: bool(w.is_demo),
      })),
      saved: num(saved[0]?.n),
      applications: num(apps[0]?.n),
      unread: num(unread[0]?.n),
      notifications: notes.map((n) => ({
        id: str(n.id),
        title: str(n.title),
        body: str(n.body),
        href: str(n.href),
        at: str(n.at),
      })),
      recommended,
      completion,
      isAdmin: roles.includes("ADMIN") || roles.includes("SUPER_ADMIN"),
    };
  });

type Draft = {
  title: string;
  propertyType: string;
  address: string;
  city: string;
  locality: string;
  pincode: string;
  monthlyRent: number;
  deposit: number;
  availableFrom: string;
  minStay: number;
  maxStay: number | null;
  roomType: string;
  furnished: string;
  attachedBath: boolean;
  balcony: boolean;
  ac: boolean;
  wifi: boolean;
  kitchen: boolean;
  washingMachine: boolean;
  parking: boolean;
  powerBackup: boolean;
  lift: boolean;
  housekeeping: boolean;
  food: boolean;
  smoking: boolean;
  pets: boolean;
  guestPolicy: string;
  genderPref: string;
  agePref: string;
  occupationPref: string;
  roommatePref: string;
  occupants: number;
  listingKind: "BED" | "ENTIRE_FLAT";
  bedrooms: number;
  description: string;
  photos: { url: string; category: string }[];
  trust: TrustFields;
};

function draftOf(input: unknown): Draft {
  const o = asRecord(input);
  const roomType = text(o.roomType, 40, "Room type", true);
  if (!(ROOM_TYPES as readonly string[]).includes(roomType)) throw new Error("Pick a room type.");
  const propertyType = text(o.propertyType, 40, "Property type", true);
  if (!(PROPERTY_TYPES as readonly string[]).includes(propertyType))
    throw new Error("Pick a property type.");
  const furnished = text(o.furnished, 40, "Furnished", true);
  if (!(FURNISHED as readonly string[]).includes(furnished))
    throw new Error("Pick furnished status.");
  const genderPref = text(o.genderPref, 20, "Gender") || "ANY";
  if (!GENDER_PREFS.some((g) => g.value === genderPref))
    throw new Error("Pick who the room is for.");
  const occupationPref = text(o.occupationPref, 40, "Occupation") || "ANY";
  if (!(OCCUPATION_PREFS as readonly string[]).includes(occupationPref))
    throw new Error("Pick an occupation preference.");
  const monthlyRent = num(o.monthlyRent);
  const deposit = num(o.deposit);
  if (monthlyRent < 1500 || monthlyRent > 500000) throw new Error("Monthly rent looks off.");
  if (deposit < 0 || deposit > monthlyRent * 12) throw new Error("Deposit looks off.");
  const availableFrom = text(o.availableFrom, 10, "Available from", true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(availableFrom)) throw new Error("Pick an available-from date.");
  const pincode = text(o.pincode, 6, "Pincode", true);
  if (!/^\d{6}$/.test(pincode)) throw new Error("Pincode should be 6 digits.");
  const photosIn = Array.isArray(o.photos) ? o.photos : [];
  const photos = photosIn.slice(0, 8).map((p) => {
    const item = asRecord(p);
    const raw = typeof item.url === "string" ? item.url.trim() : "";
    if (raw.length < 12 || raw.length > 300_000)
      throw new Error("Add a photo, or use a smaller one.");
    const err = photoUrlError(raw);
    if (err) throw new Error(err);
    return { url: raw, category: text(item.category, 40, "Category") || "Bedroom" };
  });
  if (!photos.length) throw new Error("Add at least one photo.");
  const occupants = Math.min(12, Math.max(0, num(o.occupants)));
  const listingKind = o.listingKind === "ENTIRE_FLAT" ? "ENTIRE_FLAT" : "BED";
  const bedrooms = listingKind === "ENTIRE_FLAT" ? Math.round(num(o.bedrooms)) : 0;
  if (listingKind === "ENTIRE_FLAT" && (bedrooms < 1 || bedrooms > 10))
    throw new Error("Pick how many bedrooms the flat has (1 to 10).");
  return {
    title: text(o.title, 100, "Title", true),
    propertyType,
    address: text(o.address, 160, "Address", true),
    city: text(o.city, 60, "City", true),
    locality: text(o.locality, 80, "Locality", true),
    pincode,
    monthlyRent,
    deposit,
    availableFrom,
    minStay: Math.min(36, Math.max(1, num(o.minStay) || 1)),
    maxStay:
      o.maxStay == null || o.maxStay === "" ? null : Math.min(60, Math.max(1, num(o.maxStay))),
    roomType,
    furnished,
    attachedBath: o.attachedBath === true,
    balcony: o.balcony === true,
    ac: o.ac === true,
    wifi: o.wifi !== false,
    kitchen: o.kitchen !== false,
    washingMachine: o.washingMachine === true,
    parking: o.parking === true,
    powerBackup: o.powerBackup === true,
    lift: o.lift === true,
    housekeeping: o.housekeeping === true,
    food: o.food === true,
    smoking: o.smoking === true,
    pets: o.pets === true,
    guestPolicy: text(o.guestPolicy, 180, "Guests") || "Occasional guests with a day's notice",
    genderPref,
    agePref: text(o.agePref, 40, "Age") || "18+",
    occupationPref,
    roommatePref: text(o.roommatePref, 120, "Roommates"),
    occupants,
    listingKind,
    bedrooms,
    description: text(o.description, 800, "Description"),
    photos,
    trust: trustOf(o, num(o.monthlyRent)),
  };
}

async function attachAmenities(sql: Sql, listingId: string, draft: Draft) {
  const pairs: [string, boolean][] = [
    ["Wi-Fi", draft.wifi],
    ["Air conditioning", draft.ac],
    ["Kitchen access", draft.kitchen],
    ["Washing machine", draft.washingMachine],
    ["Parking", draft.parking],
    ["Power backup", draft.powerBackup],
    ["Lift", draft.lift],
    ["Housekeeping", draft.housekeeping],
    ["Food", draft.food],
    ["Attached bathroom", draft.attachedBath],
    ["Balcony", draft.balcony],
    ["Pets considered", draft.pets],
  ];
  await sql`delete from listing_amenities where listing_id = ${listingId}`;
  for (const [name, on] of pairs) {
    if (!on) continue;
    const amenity = await sql<{ id: string }>`select id from amenities where name = ${name}`;
    if (amenity[0]) {
      await sql`insert into listing_amenities (listing_id, amenity_id) values (${listingId}, ${amenity[0].id}) on conflict do nothing`;
    }
  }
}

export const createListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(draftOf)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const userId = context.userId;
    await requireProfile(sql, userId);
    await requirePublishable(sql, userId);
    await hitLimit(sql, userId, "listing");
    const city = await sql<{
      id: string;
      lat: number;
      lng: number;
    }>`select id, lat, lng from cities where lower(name) = lower(${data.city})`;
    if (!city[0]) throw new Error("That city is not open yet. An operator can add it.");
    const loc = await sql<{ id: string; lat: number; lng: number }>`
      select id, lat, lng from localities where city_id = ${city[0].id} and lower(name) = lower(${data.locality})`;
    if (!loc[0]) throw new Error("Pick a locality from the list for that city.");
    const propertyId = crypto.randomUUID();
    const listingId = crypto.randomUUID();
    const description =
      data.description ||
      `${data.roomType} in ${data.locality}, ${data.city}. ${data.furnished}. Rent ₹${data.monthlyRent.toLocaleString("en-IN")} a month.`;
    const fingerprint =
      `${data.city}|${data.locality}|${data.monthlyRent}|${data.roomType}`.toLowerCase();
    const dup =
      await sql`select id from listings where fingerprint = ${fingerprint} and status = 'ACTIVE' limit 1`;
    await sql.query(
      `insert into properties (id, owner_id, title, property_type, address, city_id, locality_id, pincode, lat, lng)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        propertyId,
        userId,
        data.title,
        data.propertyType,
        data.address,
        city[0].id,
        loc[0].id,
        data.pincode,
        num(loc[0].lat),
        num(loc[0].lng),
      ],
    );
    const quality =
      55 +
      Math.min(15, data.photos.length * 5) +
      (data.description.length > 80 ? 8 : 0) +
      (data.furnished !== "Unfurnished" ? 6 : 0);
    const reply = `Thanks for writing about the ${data.roomType.toLowerCase()} in ${data.locality}. It is listed from ${data.availableFrom}. Tell me your move-in week and I can arrange a video tour.`;
    await sql.query(
      `insert into listings (
        id, property_id, owner_id, title, description, city_name, locality_name, monthly_rent, deposit,
        available_from, min_stay_months, max_stay_months, room_type, furnished, attached_bath, balcony, ac, wifi,
        kitchen, washing_machine, parking, power_backup, lift, housekeeping, food_available, smoking_allowed,
        pets_allowed, guest_policy, gender_pref, age_pref, occupation_pref, roommate_pref, occupants,
        fingerprint, possible_duplicate, auto_reply, quality_score
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37
      )`,
      [
        listingId,
        propertyId,
        userId,
        data.title,
        description,
        data.city,
        data.locality,
        data.monthlyRent,
        data.deposit,
        data.availableFrom,
        data.minStay,
        data.maxStay,
        data.roomType,
        data.furnished,
        data.attachedBath,
        data.balcony,
        data.ac,
        data.wifi,
        data.kitchen,
        data.washingMachine,
        data.parking,
        data.powerBackup,
        data.lift,
        data.housekeeping,
        data.food,
        data.smoking,
        data.pets,
        data.guestPolicy,
        data.genderPref,
        data.agePref,
        data.occupationPref,
        data.roommatePref,
        data.occupants,
        fingerprint,
        dup.length > 0,
        reply,
        Math.min(98, quality),
      ],
    );
    await sql`update listings set listing_kind = ${data.listingKind}, bedrooms = ${data.bedrooms || null} where id = ${listingId}`;
    for (let i = 0; i < data.photos.length; i++) {
      await sql`insert into listing_images (id, listing_id, url, category, sort_order) values (${crypto.randomUUID()}, ${listingId}, ${data.photos[i].url}, ${data.photos[i].category}, ${i})`;
    }
    await attachAmenities(sql, listingId, data);
    await writeTrust(sql, listingId, data.trust);
    await sql`insert into profile_roles (user_id, role) values (${userId}, 'HOST') on conflict do nothing`;
    logEvent("listing.created", { city: data.city, photos: data.photos.length });
    return { id: listingId };
  });

export const setListingStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const status = str(o.status);
    if (!["ACTIVE", "PAUSED", "OCCUPIED", "REMOVED"].includes(status))
      throw new Error("Unknown status.");
    return { id: listingKey(o.id), status };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    if (data.status === "ACTIVE") await requirePublishable(sql, context.userId);
    const updated =
      await sql`update listings set status = ${data.status}, updated_at = now() where id = ${data.id} and owner_id = ${context.userId} returning id`;
    if (!updated.length) throw new Error("You can only change your own listing.");
    await audit(sql, context.userId, `owner.${data.status.toLowerCase()}`, "listing", data.id, "");
    return { ok: true };
  });

export const createRoomWanted = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const budget = num(o.budget);
    if (budget < 1500 || budget > 500000) throw new Error("Budget looks off.");
    const moveIn = text(o.moveIn, 10, "Move-in");
    return {
      city: text(o.city, 60, "City", true),
      localities: text(o.localities, 120, "Localities"),
      budget,
      moveIn: /^\d{4}-\d{2}-\d{2}$/.test(moveIn) ? moveIn : "",
      duration: Math.min(36, Math.max(1, num(o.duration) || 6)),
      roomPref: text(o.roomPref, 40, "Room", true),
      furnished: text(o.furnished, 40, "Furnished") || "Furnished",
      food: text(o.food, 20, "Food") || "ANY",
      smoking: text(o.smoking, 20, "Smoking") || "NO",
      pets: text(o.pets, 20, "Pets") || "NO",
      roommateGender: text(o.roommateGender, 20, "Roommates") || "ANY",
      people: Math.min(4, Math.max(1, num(o.people) || 1)),
      bio: text(o.bio, 500, "Bio", true),
      lifestyle: text(o.lifestyle, 240, "Lifestyle"),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const id = crypto.randomUUID();
    await sql.query(
      `insert into room_wanted (
        id, user_id, display_name, age, gender, occupation, city, localities, budget, move_in, duration_months,
        room_pref, furnished_pref, food_pref, smoking_pref, pet_pref, roommate_gender, people_count, bio, lifestyle
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        id,
        context.userId,
        str(profile.full_name),
        profile.age == null ? null : num(profile.age),
        str(profile.gender) || null,
        str(profile.occupation) || null,
        data.city,
        data.localities,
        data.budget,
        data.moveIn || null,
        data.duration,
        data.roomPref,
        data.furnished,
        data.food,
        data.smoking,
        data.pets,
        data.roommateGender,
        data.people,
        data.bio,
        data.lifestyle,
      ],
    );
    await sql`insert into profile_roles (user_id, role) values (${context.userId}, 'SEEKER') on conflict do nothing`;
    return { id };
  });

export const setWantedStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const status = str(o.status);
    if (!["ACTIVE", "PAUSED", "REMOVED"].includes(status)) throw new Error("Unknown status.");
    return { id: listingKey(o.id), status };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    const updated =
      await sql`update room_wanted set status = ${data.status}, updated_at = now() where id = ${data.id} and user_id = ${context.userId} returning id`;
    if (!updated.length) throw new Error("That request is not yours.");
    return { ok: true };
  });

export const saveListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(listingKey)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    const listing = await sql`select id from listings where id = ${data} and status <> 'REMOVED'`;
    if (!listing.length) throw new Error("That room is not available.");
    await sql`insert into saved_listings (user_id, listing_id) values (${context.userId}, ${data}) on conflict do nothing`;
    return { ok: true };
  });

export const unsaveListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(listingKey)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from saved_listings where user_id = ${context.userId} and listing_id = ${data}`;
    return { ok: true };
  });

export const listSaved = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select ${CARD}
       from saved_listings s
       join listings l on l.id = s.listing_id
       join profiles pr on pr.user_id = l.owner_id
       join properties p on p.id = l.property_id
       where s.user_id = $1 and l.status = 'ACTIVE'
       order by s.created_at desc`,
      [context.userId],
    );
    return rows.map(listingCard);
  });

export const savedIds = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      listing_id: string;
    }>`select listing_id from saved_listings where user_id = ${context.userId}`;
    return rows.map((r) => r.listing_id);
  });

async function blocked(sql: Sql, a: string, b: string) {
  const rows =
    await sql`select 1 from blocks where (blocker_id = ${a} and blocked_id = ${b}) or (blocker_id = ${b} and blocked_id = ${a}) limit 1`;
  return rows.length > 0;
}

export const openConversation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const listingId = o.listingId ? listingKey(o.listingId) : "";
    const roomWantedId = o.roomWantedId ? listingKey(o.roomWantedId) : "";
    const withUser = typeof o.withUserId === "string" ? o.withUserId.trim() : "";
    if (withUser && !/^[A-Za-z0-9_-]{8,80}$/.test(withUser)) throw new Error("Unknown person.");
    if (!listingId && !roomWantedId) throw new Error("Pick a room or a person to message.");
    return { listingId, roomWantedId, withUserId: withUser };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    let other = "";
    let listingId: string | null = null;
    let roomWantedId: string | null = null;
    if (data.listingId) {
      const listing = await sql<{
        owner_id: string;
      }>`select owner_id from listings where id = ${data.listingId} and status <> 'REMOVED'`;
      if (!listing[0]) throw new Error("That room is not available.");
      listingId = data.listingId;
      if (data.withUserId) {
        if (listing[0].owner_id !== context.userId)
          throw new Error("Only the host can message an applicant this way.");
        const applied =
          await sql`select id from applications where listing_id = ${data.listingId} and seeker_id = ${data.withUserId} and host_id = ${context.userId}`;
        if (!applied.length) throw new Error("That person has not requested this room.");
        other = data.withUserId;
      } else {
        other = listing[0].owner_id;
      }
    } else {
      const wanted = await sql<{
        user_id: string;
      }>`select user_id from room_wanted where id = ${data.roomWantedId} and status = 'ACTIVE'`;
      if (!wanted[0]) throw new Error("That request is closed.");
      other = wanted[0].user_id;
      roomWantedId = data.roomWantedId;
    }
    if (other === context.userId) throw new Error("You cannot message yourself.");
    if (await blocked(sql, context.userId, other)) throw new Error("Messaging is blocked.");
    await hitLimit(sql, context.userId, "conversation");
    const otherProfile = await sql<{
      allow_messages: string;
      account_status: string;
    }>`select allow_messages, account_status from profiles where user_id = ${other}`;
    if (!otherProfile[0] || otherProfile[0].account_status === "SUSPENDED")
      throw new Error("This person is not taking messages.");
    if (otherProfile[0].allow_messages === "NONE")
      throw new Error("This person is not taking messages.");
    const existing = await sql<{ id: string }>`
      select c.id from conversations c
      join conversation_members a on a.conversation_id = c.id and a.user_id = ${context.userId}
      join conversation_members b on b.conversation_id = c.id and b.user_id = ${other}
      where c.listing_id is not distinct from ${listingId} and c.room_wanted_id is not distinct from ${roomWantedId} and c.squad_id is null
      limit 1`;
    if (existing[0]) {
      const closed = await sql<{
        closed_at: string | null;
      }>`select closed_at from conversations where id = ${existing[0].id}`;
      if (closed[0]?.closed_at) throw new Error("This thread is closed.");
      return { id: existing[0].id };
    }
    // Seekers pay the contact fee once per listing before the first message. Hosts never pay.
    if (listingId && !data.withUserId) {
      const owner = await sql<{
        owner_id: string;
        is_demo: boolean;
      }>`select owner_id, is_demo from listings where id = ${listingId}`;
      if (owner[0] && !owner[0].is_demo)
        await assertContactAllowed(sql, listingId, context.userId, owner[0].owner_id);
    }
    const id = crypto.randomUUID();
    await sql`insert into conversations (id, listing_id, room_wanted_id) values (${id}, ${listingId}, ${roomWantedId})`;
    await sql`insert into conversation_members (conversation_id, user_id) values (${id}, ${context.userId})`;
    await sql`insert into conversation_members (conversation_id, user_id) values (${id}, ${other})`;
    return { id };
  });

export const listConversations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    await sql`update profiles set last_seen = now() where user_id = ${context.userId}`;
    const rows = await sql.query<Record<string, unknown>>(
      `select c.id, c.listing_id, l.title as listing_title, c.squad_id, sq.name as squad_name,
              op.user_id as other_id, op.full_name as other_name, op.is_demo as other_demo,
              op.last_seen::text as other_seen,
              (select m.body from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_body,
              (select count(*)::int from messages m where m.conversation_id = c.id and m.sender_id <> $1 and m.created_at > coalesce(cm.last_read_at, '1970-01-01')) as unread
       from conversations c
       join conversation_members cm on cm.conversation_id = c.id and cm.user_id = $1
       join lateral (
         select om.user_id from conversation_members om
         where om.conversation_id = c.id and om.user_id <> $1
         order by (om.user_id = (select owner_id from listings where id = c.listing_id)) desc, om.user_id
         limit 1
       ) om on true
       join profiles op on op.user_id = om.user_id
       left join listings l on l.id = c.listing_id
       left join squads sq on sq.id = c.squad_id
       order by c.updated_at desc
       limit 40`,
      [context.userId],
    );
    return rows.map((r) => ({
      id: str(r.id),
      listingId: str(r.listing_id),
      listingTitle: str(r.listing_title),
      otherId: str(r.other_id),
      otherName: r.squad_id ? `${str(r.squad_name)} · squad chat` : str(r.other_name),
      isSquad: Boolean(r.squad_id),
      otherDemo: bool(r.other_demo),
      otherSeen: str(r.other_seen),
      lastBody: str(r.last_body),
      unread: num(r.unread),
    }));
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(listingKey)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    const member =
      await sql`select 1 from conversation_members where conversation_id = ${data} and user_id = ${context.userId}`;
    if (!member.length) throw new Error("That conversation is not yours.");
    await sql`update conversation_members set last_read_at = now() where conversation_id = ${data} and user_id = ${context.userId}`;
    const rows = await sql.query<Record<string, unknown>>(
      `select m.id, m.sender_id, m.body, m.kind, p.full_name as sender_name, to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as at
       from messages m left join profiles p on p.user_id = m.sender_id where m.conversation_id = $1 order by m.created_at asc limit 200`,
      [data],
    );
    return rows.map((m) => ({
      id: str(m.id),
      senderId: str(m.sender_id),
      senderName: str(m.sender_name),
      body: str(m.body),
      kind: str(m.kind),
      at: str(m.at),
      mine: str(m.sender_id) === context.userId,
    }));
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const body = text(o.body, 2000, "Message", true);
    return { id: listingKey(o.id), body };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    await hitLimit(sql, context.userId, "message");
    const members = await sql<{
      user_id: string;
    }>`select user_id from conversation_members where conversation_id = ${data.id}`;
    if (!members.some((m) => m.user_id === context.userId))
      throw new Error("That conversation is not yours.");
    const closed = await sql<{
      closed_at: string | null;
    }>`select closed_at from conversations where id = ${data.id}`;
    if (closed[0]?.closed_at) throw new Error("This thread is closed.");
    const other = members.find((m) => m.user_id !== context.userId)?.user_id;
    if (other && (await blocked(sql, context.userId, other)))
      throw new Error("Messaging is blocked.");
    if (other) {
      const otherStatus = await sql<{
        account_status: string;
      }>`select account_status from profiles where user_id = ${other}`;
      if (otherStatus[0]?.account_status === "SUSPENDED")
        throw new Error("This person is not taking messages.");
    }
    await sql`insert into messages (id, conversation_id, sender_id, body) values (${crypto.randomUUID()}, ${data.id}, ${context.userId}, ${data.body})`;
    await sql`update conversations set updated_at = now() where id = ${data.id}`;
    if (other) {
      const host = await sql<{
        is_demo: boolean;
        full_name: string;
      }>`select is_demo, full_name from profiles where user_id = ${other}`;
      const prior =
        await sql`select id from messages where conversation_id = ${data.id} and sender_id = ${other} limit 1`;
      if (host[0]?.is_demo && !prior.length) {
        const convo = await sql<{
          listing_id: string | null;
        }>`select listing_id from conversations where id = ${data.id}`;
        let reply =
          "Thanks for writing. The room is still open. Tell me your move-in week and I can do a video tour after 7pm.";
        if (convo[0]?.listing_id) {
          const listing = await sql<{
            auto_reply: string;
          }>`select auto_reply from listings where id = ${convo[0].listing_id}`;
          if (listing[0]?.auto_reply) reply = listing[0].auto_reply;
        }
        await sql`insert into messages (id, conversation_id, sender_id, body, kind) values (${crypto.randomUUID()}, ${data.id}, ${other}, ${reply}, 'QUICK_REPLY')`;
      } else if (host[0] && !host[0].is_demo) {
        for (const m of members.filter((x) => x.user_id !== context.userId)) {
          await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${m.user_id}, 'message', 'New message', ${data.body.slice(0, 140)}, ${"/messages?thread=" + data.id})`;
        }
      }
    }
    return { ok: true };
  });

export const blockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text(asRecord(input).userId, 80, "Person", true);
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error("Unknown person.");
    return id;
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    if (data === context.userId) throw new Error("You cannot block yourself.");
    await sql`insert into blocks (blocker_id, blocked_id) values (${context.userId}, ${data}) on conflict do nothing`;
    return { ok: true };
  });

export const fileReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const category = text(o.category, 40, "Category", true);
    if (!(REPORT_CATEGORIES as readonly string[]).includes(category))
      throw new Error("Pick a report reason.");
    const targetType = str(o.targetType);
    if (targetType !== "LISTING" && targetType !== "USER") throw new Error("Unknown report.");
    return {
      targetType,
      targetId: text(o.targetId, 80, "Target", true),
      category,
      note: text(o.note, 500, "Note"),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await hitLimit(sql, context.userId, "report");
    await requireProfile(sql, context.userId);
    const fraud = data.category === "Scam" || data.category === "Fake listing";
    await sql.query(
      `insert into reports (id, reporter_id, target_type, target_id, category, note, fraud_flag) values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        crypto.randomUUID(),
        context.userId,
        data.targetType,
        data.targetId,
        data.category,
        data.note,
        fraud,
      ],
    );
    return { ok: true };
  });

export const applyToListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    return { id: listingKey(o.id), note: text(o.note, 400, "Note") };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const listing = await sql<{
      owner_id: string;
      title: string;
    }>`select owner_id, title from listings where id = ${data.id} and status = 'ACTIVE'`;
    if (!listing[0]) throw new Error("That room is not taking requests.");
    if (listing[0].owner_id === context.userId) throw new Error("This is your own room.");
    const host = await sql<{
      is_demo: boolean;
      account_status: string;
    }>`select is_demo, account_status from profiles where user_id = ${listing[0].owner_id}`;
    if (!host[0] || host[0].account_status === "SUSPENDED")
      throw new Error("That room is not taking requests.");
    if (await blocked(sql, context.userId, listing[0].owner_id))
      throw new Error("That room is not taking requests.");
    await hitLimit(sql, context.userId, "apply");
    const existing =
      await sql`select id from applications where listing_id = ${data.id} and seeker_id = ${context.userId} and status in ('PENDING','ACCEPTED')`;
    if (existing.length) throw new Error("You already have a request on this room.");
    const note = data.note || `${str(profile.full_name)} would like to visit.`;
    await sql.query(
      `insert into applications (id, listing_id, seeker_id, host_id, note) values ($1,$2,$3,$4,$5)`,
      [crypto.randomUUID(), data.id, context.userId, listing[0].owner_id, note],
    );
    if (!host[0].is_demo) {
      await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${listing[0].owner_id}, 'application', 'New room request', ${note.slice(0, 140)}, '/applications')`;
    }
    if (!host[0].is_demo) {
      const ownerPhone = await verifiedPhone(sql, listing[0].owner_id);
      await notifyWhatsApp("applicationReceived", ownerPhone, [
        str(profile.full_name),
        listing[0].title,
      ]);
    }
    logEvent("application.created", { demoHost: Boolean(host[0].is_demo) });
    return { ok: true };
  });

export const listApplications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select a.id, a.status, a.note, a.listing_id, a.seeker_id, a.host_id, l.title, l.city_name, l.monthly_rent, l.deposit, l.is_demo,
              ps.full_name as seeker_name, ps.identity_status as seeker_identity, ph.identity_status as host_identity,
              ra.seeker_ok, ra.host_ok, ra.status as agreement_status,
              to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD') as created_on
       from applications a
       join listings l on l.id = a.listing_id
       join profiles ps on ps.user_id = a.seeker_id
       join profiles ph on ph.user_id = a.host_id
       left join rent_agreements ra on ra.application_id = a.id
       where a.seeker_id = $1 or a.host_id = $1
       order by a.created_at desc`,
      [context.userId],
    );
    return rows.map((r) => {
      const quote = rentQuote(num(r.monthly_rent), num(r.deposit));
      return {
        id: str(r.id),
        status: str(r.status),
        note: str(r.note),
        listingId: str(r.listing_id),
        title: str(r.title),
        city: str(r.city_name),
        rent: quote.rent,
        deposit: quote.deposit,
        seekerPays: quote.seekerPays,
        hostReceives: quote.hostReceives,
        fee: quote.seekerFee,
        seekerId: str(r.seeker_id),
        hostId: str(r.host_id),
        seekerName: str(r.seeker_name),
        mine: str(r.seeker_id) === context.userId,
        createdOn: str(r.created_on),
        demo: bool(r.is_demo),
        seekerIdentity: str(r.seeker_identity) || "UNVERIFIED",
        hostIdentity: str(r.host_identity) || "UNVERIFIED",
        seekerAgreed: bool(r.seeker_ok),
        hostAgreed: bool(r.host_ok),
        agreement: str(r.agreement_status),
      };
    });
  });

export const setApplication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const status = str(o.status);
    if (!["ACCEPTED", "DECLINED", "WITHDRAWN"].includes(status))
      throw new Error("Unknown decision.");
    return { id: listingKey(o.id), status };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    const rows = await sql<{
      seeker_id: string;
      host_id: string;
      status: string;
      listing_id: string;
    }>`select seeker_id, host_id, status, listing_id from applications where id = ${data.id}`;
    const row = rows[0];
    if (!row) throw new Error("Request not found.");
    if (data.status === "WITHDRAWN" && row.seeker_id !== context.userId)
      throw new Error("Only the seeker can withdraw.");
    if (data.status !== "WITHDRAWN" && row.host_id !== context.userId)
      throw new Error("Only the host can decide.");
    await sql`update applications set status = ${data.status}, updated_at = now() where id = ${data.id}`;
    if (contactRefundDue({ decision: data.status, previousStatus: row.status })) {
      await markContactRefundDue(sql, {
        listingId: row.listing_id,
        seekerId: row.seeker_id,
        reason: "Owner declined the request.",
      });
    }
    if (data.status === "ACCEPTED" || data.status === "DECLINED") {
      const title = data.status === "ACCEPTED" ? "Visit accepted" : "Request declined";
      const body =
        data.status === "ACCEPTED"
          ? "The host accepted your visit. You can keep talking in messages."
          : "The host declined this visit request.";
      await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${row.seeker_id}, 'application', ${title}, ${body}, '/applications')`;
      if (data.status === "ACCEPTED") {
        const info = await sql<{
          title: string;
        }>`select l.title from applications a join listings l on l.id = a.listing_id where a.id = ${data.id}`;
        await notifyWhatsApp("applicationAccepted", await verifiedPhone(sql, row.seeker_id), [
          str(info[0]?.title),
        ]);
      }
    }
    logEvent("application.updated", { status: data.status });
    return { ok: true };
  });

export const getMatches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const wanted = await sql<
      Record<string, unknown>
    >`select * from room_wanted where user_id = ${context.userId} and status = 'ACTIVE' order by created_at desc limit 1`;
    const facts = seekerFrom(profile, wanted[0]);
    if (!facts.city && !facts.budget) {
      return { ready: false as const, matches: [] };
    }
    const pool = await sql.query<Record<string, unknown>>(
      `select l.id, l.title, l.city_name, l.locality_name, l.monthly_rent, l.deposit, l.room_type, l.furnished,
              l.gender_pref, l.available_from::text as available_from, case when pr.identity_status = 'VERIFIED' and pr.phone_verified_at is not null then 'VERIFIED' else 'UNVERIFIED' end as verification_status, l.status, l.listing_tier,
              l.is_demo, l.food_available, l.quality_score, l.occupation_pref, l.smoking_allowed, l.pets_allowed,
              p.property_type, pr.full_name as host_name,
              (select i.url from listing_images i where i.listing_id = l.id order by i.sort_order limit 1) as photo
       from listings l
       join profiles pr on pr.user_id = l.owner_id
       join properties p on p.id = l.property_id
       where l.status = 'ACTIVE' and l.owner_id <> $1
         and pr.account_status = 'ACTIVE'
         and (l.is_demo = true or pr.identity_status = 'VERIFIED')
       limit 80`,
      [context.userId],
    );
    const matches = pool
      .map((listing) => ({
        card: listingCard(listing),
        match: scoreMatch(
          {
            city: str(listing.city_name),
            locality: str(listing.locality_name),
            rent: num(listing.monthly_rent),
            availableFrom: str(listing.available_from),
            roomType: str(listing.room_type),
            genderPref: str(listing.gender_pref),
            occupationPref: str(listing.occupation_pref),
            smokingAllowed: bool(listing.smoking_allowed),
            petsAllowed: bool(listing.pets_allowed),
            foodAvailable: bool(listing.food_available),
          },
          facts,
        ),
      }))
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 12);
    return { ready: true as const, matches };
  });

export const scoreFor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => listingKey(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await requireProfile(sql, context.userId);
    const wanted = await sql<
      Record<string, unknown>
    >`select * from room_wanted where user_id = ${context.userId} and status = 'ACTIVE' order by created_at desc limit 1`;
    const listing = await sql<Record<string, unknown>>`select * from listings where id = ${data}`;
    if (!listing[0] || str(listing[0].owner_id) === context.userId)
      return { score: null, reasons: [] };
    const facts = seekerFrom(profile, wanted[0]);
    if (!facts.city && !facts.budget) return { score: null, reasons: [] };
    return scoreMatch(
      {
        city: str(listing[0].city_name),
        locality: str(listing[0].locality_name),
        rent: num(listing[0].monthly_rent),
        availableFrom: str(listing[0].available_from),
        roomType: str(listing[0].room_type),
        genderPref: str(listing[0].gender_pref),
        occupationPref: str(listing[0].occupation_pref),
        smokingAllowed: bool(listing[0].smoking_allowed),
        petsAllowed: bool(listing[0].pets_allowed),
        foodAvailable: bool(listing[0].food_available),
      },
      facts,
    );
  });

export const getListingAddress = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(listingKey)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    const rows = await sql<{ address: string; pincode: string; owner_id: string; status: string }>`
      select p.address, p.pincode, l.owner_id, l.status
      from listings l join properties p on p.id = l.property_id
      where l.id = ${data}`;
    const row = rows[0];
    if (!row || row.status === "REMOVED") throw new Error("Address unavailable.");
    if (row.owner_id !== context.userId) {
      const accepted = await sql`
        select id from applications
        where listing_id = ${data} and seeker_id = ${context.userId} and status = 'ACCEPTED'
        limit 1`;
      if (!accepted.length)
        throw new Error("The street address is shared after the host accepts you.");
    }
    return { address: row.address, pincode: row.pincode };
  });

export const rememberSearch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => text(input, 120, "Search"))
  .handler(async ({ context, data }) => {
    if (!data) return { ok: true };
    const sql = await getSql();
    await hitLimit(sql, context.userId, "search");
    await sql`insert into search_history (id, user_id, query) values (${crypto.randomUUID()}, ${context.userId}, ${data})`;
    return { ok: true };
  });

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => planCodeSchema.parse(asRecord(input).code))
  .handler(async ({ context, data }) => {
    // Pre-v2 subscription plans (₹199/₹299/₹499) are retired: refuse before any
    // payment row is written. Current passes go through startPassCheckout.
    const retired = legacyPlanRejection(data);
    if (retired) {
      const { setResponseStatus } = await import("@tanstack/react-start/server");
      setResponseStatus(retired.status);
      return { ok: false as const, message: retired.message };
    }
    const payee = upiPayee();
    if (!payee.ready) return { ok: false as const, message: "UPI payments are not set up yet." };
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    const plan = await sql<{
      id: string;
      price_inr: number;
      name: string;
    }>`select id, price_inr, name from subscription_plans where code = ${data} and active = true`;
    if (!plan[0] || num(plan[0].price_inr) <= 0) throw new Error("That plan is not available.");
    const amount = num(plan[0].price_inr);
    // Idempotent: reuse the open checkout for this user + plan (unique partial index backs this up).
    let row = (
      await sql<{ ref: string; status: string; amount_inr: number }>`
      select ref, status, amount_inr from payments
      where user_id = ${context.userId} and plan_id = ${plan[0].id} and provider = 'UPI' and status in ('PENDING','SUBMITTED')
      limit 1`
    )[0];
    if (!row) {
      const ref = makeRef();
      const inserted = await sql<{ ref: string; status: string; amount_inr: number }>`
        insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, plan_id)
        values (${crypto.randomUUID()}, ${context.userId}, ${plan[0].name}, ${amount}, 'PENDING', 'UPI', ${ref}, ${plan[0].id})
        on conflict do nothing
        returning ref, status, amount_inr`;
      row =
        inserted[0] ??
        (
          await sql<{ ref: string; status: string; amount_inr: number }>`
        select ref, status, amount_inr from payments
        where user_id = ${context.userId} and plan_id = ${plan[0].id} and provider = 'UPI' and status in ('PENDING','SUBMITTED')
        limit 1`
        )[0];
    }
    const link = buildUpiLink({
      vpa: payee.vpa,
      name: payee.name,
      amountInr: num(row.amount_inr),
      ref: str(row.ref),
    });
    const qr = await QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M" });
    return {
      ok: true as const,
      ref: str(row.ref),
      status: str(row.status),
      amount: num(row.amount_inr),
      plan: plan[0].name,
      payee: payee.name,
      vpa: payee.vpa,
      link,
      qr,
    };
  });

export const submitUtr = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => submitUtrInput.parse(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await hitLimit(sql, context.userId, "utr");
    const taken = await sql`select id from payments where utr = ${data.utr} limit 1`;
    if (taken.length) throw new Error("That UTR has already been submitted.");
    const kindRow = await sql<{
      kind: string;
    }>`select kind from payments where ref = ${data.ref} and user_id = ${context.userId}`;
    if ((kindRow[0]?.kind === "CONTACT" || kindRow[0]?.kind === "PASS") && !data.payerVpa)
      throw new Error("Add your UPI ID so we can refund you under the refund promise.");
    const updated = await sql<{ id: string }>`
      update payments set utr = ${data.utr}, payer_vpa = ${data.payerVpa ?? null}, status = 'SUBMITTED', submitted_at = now()
      where ref = ${data.ref} and user_id = ${context.userId} and provider = 'UPI' and status = 'PENDING'
      returning id`.catch((e: unknown) => {
      if (String(e).includes("payments_utr_key"))
        throw new Error("That UTR has already been submitted.");
      throw e;
    });
    if (!updated.length) throw new Error("This payment is not waiting for a UTR.");
    logEvent("payment.utr_submitted", {});
    return {
      ok: true,
      message: "Thanks. We'll confirm once the ₹ lands in our account, usually within a few hours.",
    };
  });

export const listPlans = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<
    Record<string, unknown>
  >`select code, name, audience, price_inr, perks from subscription_plans where active = true order by price_inr`;
  return rows.map((p) => ({
    code: str(p.code),
    name: str(p.name),
    audience: str(p.audience),
    price: num(p.price_inr),
    perks: str(p.perks),
  }));
});

function readLayoutJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function layoutWidgets(raw: unknown): { id: string; position: number; visible: boolean }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = str(row.id).slice(0, 40);
    if (!id) return [];
    return [{ id, position: num(row.position), visible: row.visible !== false }];
  });
}

export const saveLayout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const surface = str(o.surface);
    if (surface !== "admin" && surface !== "host") throw new Error("Unknown desk.");
    if (!Array.isArray(o.widgets)) throw new Error("Layout is missing.");
    const widgets = o.widgets.slice(0, 12).map((w, i) => {
      const item = asRecord(w);
      const id = text(item.id, 40, "Widget", true);
      return { id, position: i + 1, visible: item.visible !== false };
    });
    return { surface, widgets };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireProfile(sql, context.userId);
    const current = await sql<{
      layout: string;
    }>`select layout from dashboard_layouts where user_id = ${context.userId}`;
    const parsed = current[0] ? readLayoutJson(current[0].layout) : {};
    parsed[data.surface] = data.widgets;
    const layout = JSON.stringify(parsed);
    if (current[0]) {
      await sql`update dashboard_layouts set layout = ${layout}, updated_at = now() where user_id = ${context.userId}`;
    } else {
      await sql`insert into dashboard_layouts (user_id, layout) values (${context.userId}, ${layout})`;
    }
    return { ok: true };
  });

export const readLayout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const surface = str(asRecord(input).surface);
    if (surface !== "admin" && surface !== "host") throw new Error("Unknown desk.");
    return { surface };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const current = await sql<{
      layout: string;
    }>`select layout from dashboard_layouts where user_id = ${context.userId}`;
    if (!current[0]) return { widgets: [] as { id: string; position: number; visible: boolean }[] };
    const parsed = readLayoutJson(current[0].layout);
    return { widgets: layoutWidgets(parsed[data.surface]) };
  });
