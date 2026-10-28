// Pure rules for editing a listing after it is created. No DB access, so it is testable.
import { FURNISHED } from "./constants.ts";
import { photoUrlError } from "./services.ts";

export const MAX_PHOTOS = 8;

export const EDIT_AMENITIES = [
  { key: "wifi", label: "WiFi", column: "wifi", amenity: "Wi-Fi" },
  { key: "kitchen", label: "Kitchen", column: "kitchen", amenity: "Kitchen access" },
  { key: "ac", label: "AC", column: "ac", amenity: "Air conditioning" },
  { key: "attachedBath", label: "Attached bath", column: "attached_bath", amenity: "Attached bathroom" },
  { key: "balcony", label: "Balcony", column: "balcony", amenity: "Balcony" },
  { key: "washingMachine", label: "Washing machine", column: "washing_machine", amenity: "Washing machine" },
  { key: "parking", label: "Parking", column: "parking", amenity: "Parking" },
  { key: "powerBackup", label: "Power backup", column: "power_backup", amenity: "Power backup" },
  { key: "lift", label: "Lift", column: "lift", amenity: "Lift" },
  { key: "housekeeping", label: "Housekeeping", column: "housekeeping", amenity: "Housekeeping" },
  { key: "food", label: "Food", column: "food_available", amenity: "Food" },
  { key: "smoking", label: "Smoking allowed", column: "smoking_allowed", amenity: null },
  { key: "pets", label: "Pets allowed", column: "pets_allowed", amenity: "Pets considered" },
] as const;

export type AmenityKey = (typeof EDIT_AMENITIES)[number]["key"];

export type ListingEdit = {
  id: string;
  monthlyRent: number;
  deposit: number;
  description: string;
  furnished: string;
  availableFrom: string;
  amenities: Record<AmenityKey, boolean>;
  keepPhotoIds: string[];
  newPhotos: { url: string; category: string }[];
};

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function whole(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

const ID = /^[0-9a-f-]{8,80}$/i;

/** Validate an edit. Throws a friendly message on the first problem. */
export function editOf(input: unknown): ListingEdit {
  const o = rec(input);
  const id = typeof o.id === "string" && ID.test(o.id) ? o.id : "";
  if (!id) throw new Error("Unknown room.");
  const monthlyRent = whole(o.monthlyRent);
  if (!(monthlyRent >= 1500 && monthlyRent <= 500000)) throw new Error("Monthly rent looks off. Use ₹1,500 to ₹5,00,000.");
  const deposit = whole(o.deposit);
  if (!(deposit >= 0 && deposit <= monthlyRent * 12)) throw new Error("Deposit looks off. Keep it under 12 months of rent.");
  const furnished = typeof o.furnished === "string" ? o.furnished.trim() : "";
  if (!(FURNISHED as readonly string[]).includes(furnished)) throw new Error("Pick furnished status.");
  const availableFrom = typeof o.availableFrom === "string" ? o.availableFrom.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(availableFrom) || Number.isNaN(Date.parse(availableFrom)))
    throw new Error("Pick an available-from date.");
  const description = typeof o.description === "string" ? o.description.trim().slice(0, 800) : "";
  const a = rec(o.amenities);
  const amenities = Object.fromEntries(EDIT_AMENITIES.map((x) => [x.key, a[x.key] === true])) as Record<AmenityKey, boolean>;
  const keepPhotoIds = (Array.isArray(o.keepPhotoIds) ? o.keepPhotoIds : [])
    .filter((v): v is string => typeof v === "string" && ID.test(v))
    .filter((v, i, all) => all.indexOf(v) === i);
  const newPhotos = (Array.isArray(o.newPhotos) ? o.newPhotos : []).map((p) => {
    const item = rec(p);
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (url.length < 12 || url.length > 300_000) throw new Error("Add a photo, or use a smaller one.");
    const err = photoUrlError(url);
    if (err) throw new Error(err);
    const category = typeof item.category === "string" && item.category.trim() ? item.category.trim().slice(0, 40) : "Bedroom";
    return { url, category };
  });
  const total = keepPhotoIds.length + newPhotos.length;
  if (total < 1) throw new Error("Keep at least one photo.");
  if (total > MAX_PHOTOS) throw new Error(`Up to ${MAX_PHOTOS} photos per room.`);
  return { id, monthlyRent, deposit, description, furnished, availableFrom, amenities, keepPhotoIds, newPhotos };
}

/** Owners edit their own rooms; operators (ADMIN / SUPER_ADMIN) can edit any. */
export function canEditListing(ownerId: string, userId: string, roles: readonly string[]): boolean {
  if (!userId) return false;
  if (ownerId && ownerId === userId) return true;
  return roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
}

/** Which stored photos to delete, given what the editor kept. Unknown ids are ignored. */
export function photosToDelete(existingIds: readonly string[], keepIds: readonly string[]): string[] {
  const keep = new Set(keepIds);
  return existingIds.filter((id) => !keep.has(id));
}

/** Kept ids that really belong to this listing, in the editor's order. */
export function validKeeps(existingIds: readonly string[], keepIds: readonly string[]): string[] {
  const have = new Set(existingIds);
  return keepIds.filter((id) => have.has(id));
}

export function editQuality(photoCount: number, description: string, furnished: string): number {
  return Math.min(98, 55 + Math.min(15, photoCount * 5) + (description.length > 80 ? 8 : 0) + (furnished !== "Unfurnished" ? 6 : 0));
}
