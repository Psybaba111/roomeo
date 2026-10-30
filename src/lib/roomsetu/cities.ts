/** Cities that are open for search. Bengaluru stays the default. */
export type SearchCity = {
  name: string;
  short: string;
  center: [number, number];
  tagline: string;
  areas: Record<string, [number, number]>;
};

export const SEARCH_CITIES: readonly SearchCity[] = [
  {
    name: "Bengaluru",
    short: "BLR",
    center: [12.9716, 77.5946],
    tagline: "Near college, office and the metro",
    areas: {
      Koramangala: [12.935, 77.624],
      Indiranagar: [12.971, 77.641],
      Whitefield: [12.97, 77.75],
      Jayanagar: [12.925, 77.583],
      "HSR Layout": [12.912, 77.645],
      "BTM Layout": [12.917, 77.61],
      Marathahalli: [12.956, 77.701],
      "Electronic City": [12.845, 77.66],
    },
  },
  {
    name: "Mangaluru",
    short: "MLR",
    center: [12.8698, 74.8431],
    tagline: "Bunder, Hampankatta and the coast",
    areas: {
      Bunder: [12.8635, 74.8365],
      Hampankatta: [12.8697, 74.8429],
      Falnir: [12.8669, 74.8487],
      Kodialbail: [12.8771, 74.8443],
      Balmatta: [12.8706, 74.8545],
      Kadri: [12.8885, 74.8556],
      Bejai: [12.8879, 74.8436],
      Kankanady: [12.8649, 74.8628],
      Pandeshwar: [12.8586, 74.8411],
      Derebail: [12.9041, 74.8536],
      Surathkal: [13.0105, 74.7943],
    },
  },
] as const;

export const DEFAULT_CITY = "Bengaluru";

const ALIASES: Record<string, string> = {
  bengaluru: "Bengaluru",
  bangalore: "Bengaluru",
  blr: "Bengaluru",
  mangaluru: "Mangaluru",
  mangalore: "Mangaluru",
  mlr: "Mangaluru",
  kudla: "Mangaluru",
};

/** Map any user input (including old spellings) to an open city. Unknown -> default. */
export function searchCity(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_CITY;
  return ALIASES[input.trim().toLowerCase()] ?? DEFAULT_CITY;
}

export function isSearchCity(name: string): boolean {
  return SEARCH_CITIES.some((c) => c.name === name);
}

export function cityInfo(name: string): SearchCity {
  return SEARCH_CITIES.find((c) => c.name === searchCity(name)) ?? SEARCH_CITIES[0];
}

/** Known public area centroid, falling back to the seeded coordinate. */
export function areaCentroid(city: string, area: string, fallback: [number, number]): [number, number] {
  return cityInfo(city).areas[area] ?? fallback;
}

export function citySeoTitle(name: string): string {
  return `Spare beds and PG rooms in ${cityInfo(name).name}`;
}

export function citySeoDescription(name: string): string {
  const c = cityInfo(name);
  return `Shared rooms, PG beds and whole flats in ${c.name}. ${c.tagline}. Chat owners free, no broker's month.`;
}

/** Search URLs for the sitemap, default city first. */
export function citySearchPaths(): string[] {
  return SEARCH_CITIES.map((c) => `/search?city=${encodeURIComponent(c.name)}`);
}

/** Budget box hint + quick chips, sized to what beds actually cost in each city. */
export function budgetHints(city: string): { placeholder: string; chips: [string, string][] } {
  if (searchCity(city) === "Mangaluru") {
    return {
      placeholder: "₹ up to 9,000",
      chips: [["Under ₹6k", "6000"], ["Under ₹8k", "8000"], ["Under ₹10k", "10000"]],
    };
  }
  return {
    placeholder: "₹ up to 15,000",
    chips: [["Under ₹10k", "10000"], ["Under ₹15k", "15000"], ["Under ₹20k", "20000"]],
  };
}
