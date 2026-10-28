/** Area-level map pins. Only locality centroids are ever used, never a property's own coordinates. */
export type Centroid = { name: string; lat: number; lng: number };
export type Pin = { locality: string; lat: number; lng: number; count: number; minRent: number };

export function areaPins(rooms: { locality: string; rent: number }[], centroids: Centroid[]): Pin[] {
  const where = new Map(centroids.map((c) => [c.name.toLowerCase(), c]));
  const pins = new Map<string, Pin>();
  for (const r of rooms) {
    const c = where.get(r.locality.toLowerCase());
    if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng) || (c.lat === 0 && c.lng === 0)) continue;
    const cur = pins.get(c.name) ?? { locality: c.name, lat: round(c.lat), lng: round(c.lng), count: 0, minRent: Number.POSITIVE_INFINITY };
    cur.count += 1;
    cur.minRent = Math.min(cur.minRent, r.rent);
    pins.set(c.name, cur);
  }
  return [...pins.values()].sort((a, b) => b.count - a.count);
}

/** ~1 km precision: enough to place an area, too coarse to find a door. */
function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function pinLabel(p: Pin): string {
  const from = `₹${p.minRent.toLocaleString("en-IN")}`;
  return `${p.locality}: ${p.count} bed${p.count === 1 ? "" : "s"} from ${from}`;
}
