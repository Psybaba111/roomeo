/**
 * Cities are open: any city a person types. No city is the default and none is featured.
 * Known area centroids are kept only as map data for the coarse area map.
 */
export type SearchCity = {
  name: string;
  short: string;
  center: [number, number];
  tagline: string;
  areas: Record<string, [number, number]>;
};

const KNOWN_AREAS: Record<string, Record<string, [number, number]>> = {
  Bengaluru: {
    Koramangala: [12.935, 77.624], Indiranagar: [12.971, 77.641], Whitefield: [12.97, 77.75], Jayanagar: [12.925, 77.583],
    "HSR Layout": [12.912, 77.645], "BTM Layout": [12.917, 77.61], Marathahalli: [12.956, 77.701], "Electronic City": [12.845, 77.66],
  },
  Mangaluru: {
    Bunder: [12.8635, 74.8365], Hampankatta: [12.8697, 74.8429], Falnir: [12.8669, 74.8487], Kodialbail: [12.8771, 74.8443],
    Balmatta: [12.8706, 74.8545], Kadri: [12.8885, 74.8556], Bejai: [12.8879, 74.8436], Kankanady: [12.8649, 74.8628],
    Pandeshwar: [12.8586, 74.8411], Derebail: [12.9041, 74.8536], Surathkal: [13.0105, 74.7943],
  },
};

/** "" means any city. */
export const DEFAULT_CITY = "";

/** Old spellings map to one name so search matches. Not a list of open cities. */
const ALIASES: Record<string, string> = {
  bangalore: "Bengaluru", blr: "Bengaluru",
  mangalore: "Mangaluru", mlr: "Mangaluru", kudla: "Mangaluru",
  bombay: "Mumbai", madras: "Chennai", calcutta: "Kolkata", gurgaon: "Gurugram", poona: "Pune", mysore: "Mysuru",
};

function titleCase(v: string): string {
  return v.replace(/\s+/g, " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Normalise any typed city. Empty or invalid -> "" (any city). */
export function searchCity(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_CITY;
  const v = input.trim().slice(0, 60);
  if (!v || !/^[\p{L} .'-]+$/u.test(v)) return DEFAULT_CITY;
  return ALIASES[v.toLowerCase()] ?? titleCase(v.toLowerCase());
}

export function isSearchCity(name: string): boolean {
  return searchCity(name) !== "";
}

export function cityInfo(name: string): SearchCity {
  const c = searchCity(name);
  return { name: c || "any city", short: c.slice(0, 3).toUpperCase(), center: [20.5937, 78.9629], tagline: "Near college, office and the metro", areas: KNOWN_AREAS[c] ?? {} };
}

/** Known public area centroid, falling back to the seeded coordinate. */
export function areaCentroid(city: string, area: string, fallback: [number, number]): [number, number] {
  return cityInfo(city).areas[area] ?? fallback;
}

export function citySeoTitle(name: string): string {
  const c = searchCity(name);
  return c ? `Spare beds and PG rooms in ${c}` : "Spare beds and PG rooms";
}

export function citySeoDescription(name: string): string {
  const c = searchCity(name);
  return `Shared rooms, PG beds and whole flats${c ? ` in ${c}` : ""}. ₹499 once, not a broker's month.`;
}

/** Search URLs for the sitemap. */
export function citySearchPaths(): string[] {
  return [];
}

/** Budget box hint + quick chips. Same for every city. */
export function budgetHints(_city: string): { placeholder: string; chips: [string, string][] } {
  return {
    placeholder: "₹ up to 15,000",
    chips: [["Under ₹8k", "8000"], ["Under ₹12k", "12000"], ["Under ₹20k", "20000"]],
  };
}
