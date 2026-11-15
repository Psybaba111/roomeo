/**
 * Exact location gate (Rohith, 1 Nov 2026): the street address, pincode, map pin and coordinates
 * stay hidden until the renter has signed the deal agreement for that listing AND, while the success
 * fee is ON, paid it (payment status PAID). While the fee is OFF (the default) no fee payment can
 * exist, so a fully signed (issued) agreement unlocks it instead. Owners and admins always see it.
 * Everyone else gets area only.
 */
import type { Sql } from "@/lib/db";
import { rolesAreAdmin } from "./admin-gate.ts";
import { FEE_OFF, feeViewOf, lockedLocationLine, type FeeView } from "./fee-copy.ts";
import { pricingConfig } from "./pricing.ts";

/**
 * `signed`: the renter signed a live agreement for this listing. `paid`: the fee condition is met —
 * a PAID success fee while the fee is ON, or the agreement being issued (everyone signed) while it is OFF.
 */
export type LocationAccess = { isOwner: boolean; isAdmin: boolean; signed: boolean; paid: boolean };
export type ExactLocation = { address: string; pincode: string; lat: number; lng: number; mapsUrl: string };

export function locationUnlocked(a: LocationAccess): boolean {
  return a.isOwner || a.isAdmin || (a.signed && a.paid);
}

/** Google Maps link. Prefers the exact pin (lat,lng); falls back to the street address text. */
export function mapsUrl(address: string, pincode: string, lat?: number, lng?: number): string {
  const hasPin = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const text = [address, address.includes(pincode) ? "" : pincode].filter(Boolean).join(" ").trim();
  const query = hasPin ? `${lat},${lng}` : text;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

/** Locked-location copy for the current fee setting. */
export function lockedLine(fee: FeeView = FEE_OFF): string {
  return lockedLocationLine(fee);
}

/**
 * Reads the facts the gate needs. Only rows for this listing and this user count.
 * `feeRequired` defaults to the live fee setting (`ROOMEO_FEE_ENABLED`).
 */
export async function locationAccess(
  sql: Sql,
  listingId: string,
  ownerId: string,
  userId: string | null,
  feeRequired: boolean = feeViewOf(pricingConfig()).on,
): Promise<LocationAccess> {
  if (!userId) return { isOwner: false, isAdmin: false, signed: false, paid: false };
  if (userId === ownerId) return { isOwner: true, isAdmin: false, signed: false, paid: false };
  const [roles, profile] = await Promise.all([
    sql<{ role: string }>`select role from profile_roles where user_id = ${userId}`,
    sql<{ account_status: string }>`select account_status from profiles where user_id = ${userId}`,
  ]);
  const isAdmin = rolesAreAdmin(roles.map((r) => String(r.role)), String(profile[0]?.account_status ?? ""));
  if (isAdmin) return { isOwner: false, isAdmin: true, signed: false, paid: false };
  // Signed: the renter's own signature on a live (not cancelled) agreement for this listing.
  // 1:1 deals record it on deal_agreements.seeker_signed_at; squad deals in deal_agreement_signers.
  const rows = await sql<{ id: string; signed: boolean; issued: boolean }>`
    select a.id,
           ((a.seeker_id = ${userId} and a.seeker_signed_at is not null)
             or exists (select 1 from deal_agreement_signers s where s.agreement_id = a.id and s.user_id = ${userId} and s.role = 'TENANT')) as signed,
           (a.issued_at is not null) as issued
      from deal_agreements a
     where a.listing_id = ${listingId} and a.cancelled_at is null
       and (a.seeker_id = ${userId} or exists (select 1 from deal_agreement_signers s where s.agreement_id = a.id and s.user_id = ${userId}))`;
  const signedIds = rows.filter((r) => r.signed).map((r) => r.id);
  if (!signedIds.length) return { isOwner: false, isAdmin: false, signed: false, paid: false };
  // Fee OFF: nothing to pay, so the fee condition (`paid`) is met once everyone has signed and
  // the agreement is issued. `signed` still means the renter's own signature.
  if (!feeRequired) {
    const issued = rows.some((r) => r.signed && r.issued);
    return { isOwner: false, isAdmin: false, signed: true, paid: issued };
  }
  const paid = await sql<{ id: string }>`
    select id from payments
     where user_id = ${userId} and kind = 'SUCCESS_FEE' and status = 'PAID' and agreement_id = any(${signedIds})
     limit 1`;
  return { isOwner: false, isAdmin: false, signed: true, paid: paid.length > 0 };
}
