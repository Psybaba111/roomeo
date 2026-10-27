export function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function str(v: unknown): string {
  return v == null ? "" : String(v);
}

export function bool(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1;
}

export type ListingCard = {
  id: string;
  title: string;
  city: string;
  locality: string;
  rent: number;
  deposit: number;
  roomType: string;
  furnished: string;
  genderPref: string;
  availableFrom: string;
  verification: string;
  status: string;
  tier: string;
  photo: string | null;
  hostName: string;
  isDemo: boolean;
  propertyType: string;
  food: boolean;
  quality: number;
};

export function cardPhoto(url: string | null, _width = 720): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "images.unsplash.com") {
      const id = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
      if (id.startsWith("photo-")) return `/demo/${id}.jpg`;
    }
  } catch {
    return url;
  }
  return url;
}

export function listingCard(row: Record<string, unknown>): ListingCard {
  return {
    id: str(row.id),
    title: str(row.title),
    city: str(row.city_name ?? row.city),
    locality: str(row.locality_name ?? row.locality),
    rent: num(row.monthly_rent),
    deposit: num(row.deposit),
    roomType: str(row.room_type),
    furnished: str(row.furnished),
    genderPref: str(row.gender_pref),
    availableFrom: str(row.available_from).slice(0, 10),
    verification: str(row.verification_status),
    status: str(row.status),
    tier: str(row.listing_tier),
    photo: row.photo ? cardPhoto(str(row.photo), 720) : null,
    hostName: str(row.host_name),
    isDemo: bool(row.is_demo),
    propertyType: str(row.property_type),
    food: bool(row.food_available),
    quality: num(row.quality_score),
  };
}

export function inr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function genderLabel(value: string): string {
  if (value === "WOMEN") return "Women";
  if (value === "MEN") return "Men";
  if (value === "F") return "Woman";
  if (value === "M") return "Man";
  return "Anyone";
}

export function whenLabel(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
