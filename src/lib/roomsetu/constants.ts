export const ROOM_TYPES = [
  "Private room",
  "Shared room",
  "Master bedroom",
  "Studio",
  "1BHK",
  "2BHK",
  "3BHK",
  "PG bed",
  "Other",
] as const;

export const PROPERTY_TYPES = [
  "Apartment",
  "Independent house",
  "PG",
  "Co-living",
  "Builder floor",
] as const;

export const FURNISHED = ["Furnished", "Semi-furnished", "Unfurnished"] as const;

export const GENDER_PREFS = [
  { value: "ANY", label: "Anyone" },
  { value: "WOMEN", label: "Women" },
  { value: "MEN", label: "Men" },
] as const;

export const OCCUPATION_PREFS = ["ANY", "Working professional", "Student"] as const;

export const REPORT_CATEGORIES = [
  "Scam",
  "Fake listing",
  "Wrong information",
  "Harassment",
  "Unsafe property",
  "Illegal activity",
  "Duplicate listing",
  "Other",
] as const;

export const PHOTO_CATEGORIES = [
  "Bedroom",
  "Bathroom",
  "Kitchen",
  "Living room",
  "Building exterior",
  "Common areas",
  "Amenities",
] as const;

export const CATALOG_PHOTOS: { url: string; category: string }[] = [
  { url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=70", category: "Living room" },
  { url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1400&q=70", category: "Living room" },
  { url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1400&q=70", category: "Living room" },
  { url: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1400&q=70", category: "Bedroom" },
  { url: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=70", category: "Bedroom" },
  { url: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1400&q=70", category: "Bedroom" },
  { url: "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1400&q=70", category: "Kitchen" },
  { url: "https://images.unsplash.com/photo-1556912173-46c336c7fd55?auto=format&fit=crop&w=1400&q=70", category: "Kitchen" },
  { url: "https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=1400&q=70", category: "Bathroom" },
  { url: "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=1400&q=70", category: "Building exterior" },
  { url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=70", category: "Building exterior" },
  { url: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1400&q=70", category: "Bedroom" },
];

export const SORTS = [
  { value: "recommended", label: "Recommended" },
  { value: "rent_asc", label: "Lowest rent" },
  { value: "rent_desc", label: "Highest rent" },
  { value: "newest", label: "Recently added" },
  { value: "nearest", label: "Nearest" },
  { value: "soon", label: "Available soon" },
] as const;

export const ADMIN_WIDGETS = [
  { id: "kpis", title: "Marketplace pulse" },
  { id: "flywheel", title: "Flywheel" },
  { id: "growth", title: "Growth" },
  { id: "cities", title: "Cities" },
  { id: "trust", title: "Trust" },
  { id: "revenue", title: "Revenue" },
] as const;

export const HOST_WIDGETS = [
  { id: "listings", title: "Your rooms" },
  { id: "enquiries", title: "Enquiries" },
  { id: "messages", title: "Messages" },
  { id: "verification", title: "Verification" },
  { id: "quality", title: "Listing quality" },
  { id: "earnings", title: "Earnings" },
] as const;

export const COMING_SOON = [
  "Digital rental agreements",
  "Tenant screening",
  "Rent collection",
  "Security deposit holding",
  "Maintenance requests",
  "Rent reminders",
  "Lease management",
] as const;

export function defaultLayout(ids: readonly { id: string }[]) {
  return ids.map((w, i) => ({ id: w.id, position: i + 1, visible: true }));
}
