// /list-your-bed: a short owner intake (phone, area, photos, price per bed, deposit) that feeds the normal listing
// write path. Pure and testable; the server function lives in account-api.ts (submitBedIntake).
import { normalizePhone } from "./waitlist.ts";
import { BENGALURU_LAUNCH_AREAS, searchCity } from "./cities.ts";

/** Area -> pincode for the Bengaluru launch areas, so owners there don't have to look one up. */
export const AREA_PINCODES: Record<string, string> = {
  Koramangala: "560034",
  "HSR Layout": "560102",
  Bellandur: "560103",
  Whitefield: "560066",
  "Electronic City": "560100",
  "BTM Layout": "560076",
  Marathahalli: "560037",
  "Manyata Tech Park": "560045",
};

export const INTAKE_PROPERTY_TYPES = ["PG", "Apartment", "Independent house"] as const;

export type Intake = {
  phoneE164: string;
  city: string;
  area: string;
  pincode: string;
  propertyType: (typeof INTAKE_PROPERTY_TYPES)[number];
  monthlyRent: number;
  deposit: number;
  photos: { url: string; category: string }[];
  ownerDeclared: boolean;
};

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** The pincode to use: the known one for a launch area, else what the owner typed (6 digits). */
export function intakePincode(area: string, typed: unknown): string {
  const known = AREA_PINCODES[area];
  if (known) return known;
  const p = str(typed, 6);
  return /^\d{6}$/.test(p) ? p : "";
}

/** Validate the intake form. Errors say what to fix. Photos are checked again by the listing path (draftOf). */
export function parseIntake(input: unknown): Intake {
  const o = rec(input);
  const phone = normalizePhone(str(o.phone, 20));
  if (!phone) throw new Error("Enter a 10 digit Indian mobile number.");
  const city = searchCity(str(o.city, 60) || "Bengaluru");
  if (!city) throw new Error("Type the city the bed is in.");
  const area = str(o.area, 60);
  if (area.length < 2) throw new Error("Pick or type the area.");
  const pincode = intakePincode(area, o.pincode);
  if (!pincode) throw new Error("Pincode should be 6 digits.");
  const propertyType = (INTAKE_PROPERTY_TYPES as readonly string[]).includes(str(o.propertyType, 40)) ? (str(o.propertyType, 40) as Intake["propertyType"]) : "PG";
  const monthlyRent = Math.round(Number(o.monthlyRent));
  if (!Number.isFinite(monthlyRent) || monthlyRent < 1500 || monthlyRent > 500000) throw new Error("Price per bed should be between ₹1,500 and ₹5,00,000 a month.");
  const deposit = Math.round(Number(o.deposit ?? 0));
  if (!Number.isFinite(deposit) || deposit < 0 || deposit > monthlyRent * 12) throw new Error("Deposit looks off. Keep it under 12 months of rent.");
  const photos = (Array.isArray(o.photos) ? o.photos : []).slice(0, 6).map((p) => ({ url: str(rec(p).url, 300_000), category: str(rec(p).category, 40) || "Bedroom" }));
  if (!photos.length || photos.some((p) => p.url.length < 12)) throw new Error("Add at least one photo of the bed.");
  return { phoneE164: `+91${phone}`, city, area, pincode, propertyType, monthlyRent, deposit, photos, ownerDeclared: o.ownerDeclared === true };
}

/** Today in IST as YYYY-MM-DD. */
export function istToday(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** The raw listing input the shared write path validates (same shape /create-listing sends). */
export function intakeListingInput(i: Intake, today = istToday()) {
  const kind = i.propertyType === "PG" ? "PG bed" : "Shared room";
  return {
    title: `${kind} in ${i.area}, ${i.city}`.slice(0, 100),
    propertyType: i.propertyType,
    address: `${i.area}, ${i.city}`,
    city: i.city,
    locality: i.area,
    pincode: i.pincode,
    monthlyRent: i.monthlyRent,
    deposit: i.deposit,
    availableFrom: today,
    minStay: 1,
    maxStay: "",
    roomType: "Shared room",
    furnished: "Furnished",
    genderPref: "ANY",
    occupationPref: "ANY",
    occupants: 0,
    listingKind: "BED",
    bedrooms: 0,
    description: "",
    wifi: true,
    kitchen: true,
    photos: i.photos,
  };
}

export type IntakeStatusKey = "live" | "under_id_review" | "needs_id" | "id_rejected";

/** What the host sees after sending a bed. Mirrors the existing visibility rule: hidden until the ID is VERIFIED. */
export function intakeStatus(p: { identityStatus: string; reviewStatus: string; phoneVerified: boolean }): { key: IntakeStatusKey; label: string; detail: string } {
  if (p.identityStatus === "VERIFIED")
    return { key: "live", label: "Live", detail: p.phoneVerified ? "Your ID is verified, so your bed shows in search." : "Your ID is verified, so your bed shows in search. Verify your phone to get the Verified badge." };
  if (p.reviewStatus === "PENDING")
    return { key: "under_id_review", label: "Under ID review", detail: "The roomeo team is checking your ID, usually within a day. Your bed stays hidden from search until then." };
  if (p.reviewStatus === "REJECTED")
    return { key: "id_rejected", label: "ID not approved", detail: "Your bed stays hidden. Send your ID details again below." };
  return { key: "needs_id", label: "Under ID review: send your ID", detail: "Your bed is saved but hidden. Send your ID below so the team can review it." };
}

export const INTAKE_AREAS: readonly string[] = BENGALURU_LAUNCH_AREAS;
