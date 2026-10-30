/** PG operations (bed board, meals, notices): pure rules. */
type Env = Record<string, string | undefined>;
const procEnv = (): Env => (typeof process === "undefined" ? {} : process.env);

export function pgOpsEnabled(env: Env = procEnv()): boolean {
  const v = env.ROOMEO_PG_OPS_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

export const BED_STATUS = { OCCUPIED: "Occupied 🛏️", VACANT: "Vacant ✨", ON_NOTICE: "On notice ⏳", BLOCKED: "Blocked 🚧" } as const;
export type BedStatus = keyof typeof BED_STATUS;
export const MEALS = ["LUNCH", "DINNER"] as const;
export type Meal = (typeof MEALS)[number];
export const MEAL_CUTOFF_HOUR_IST = 11;

const IST_MS = 5.5 * 3600_000;
export function istDate(now: Date): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
}
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Skips (and un-skips) for a day lock at 11:00 AM IST that day. Up to 14 days ahead. */
export function mealOpen(mealDate: string, now: Date): boolean {
  const cutoff = new Date(`${mealDate}T${String(MEAL_CUTOFF_HOUR_IST).padStart(2, "0")}:00:00+05:30`).getTime();
  return now.getTime() < cutoff && mealDate <= addDays(istDate(now), 14);
}

/** Who still needs feeding: residents minus skips, per meal. */
export function headcount(residents: number, skips: { meal: string }[]): Record<Meal, number> {
  return {
    LUNCH: Math.max(0, residents - skips.filter((s) => s.meal === "LUNCH").length),
    DINNER: Math.max(0, residents - skips.filter((s) => s.meal === "DINNER").length),
  };
}

export type BedInput = { label: string; status: BedStatus; tenantName: string; moveInDate: string | null; noticeEnd: string | null; note: string };

export function parseBed(o: Record<string, unknown>): BedInput {
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const d = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const label = s(o.label, 40);
  if (!label) throw new Error("Name the bed (e.g. Room 2 · B).");
  const status = s(o.status, 12) as BedStatus;
  if (!(status in BED_STATUS)) throw new Error("Pick a bed status.");
  const bed: BedInput = { label, status, tenantName: s(o.tenantName, 80), moveInDate: d(o.moveInDate), noticeEnd: d(o.noticeEnd), note: s(o.note, 200) };
  if (status === "ON_NOTICE" && !bed.noticeEnd) throw new Error("Add the notice end date.");
  if (status === "VACANT" || status === "BLOCKED") Object.assign(bed, { tenantName: "", moveInDate: null, noticeEnd: null });
  if (status === "OCCUPIED") bed.noticeEnd = null;
  return bed;
}

/** When the relisted bed is free from: vacant → today, on notice → day after notice ends. null = can't relist. */
export function relistFrom(bed: { status: string; notice_end: string | null }, today: string): string | null {
  if (bed.status === "VACANT") return today;
  if (bed.status === "ON_NOTICE" && bed.notice_end) return addDays(bed.notice_end, 1) < today ? today : addDays(bed.notice_end, 1);
  return null;
}

export function boardSummary(beds: { status: string }[]) {
  const c = (s: string) => beds.filter((b) => b.status === s).length;
  return { total: beds.length, occupied: c("OCCUPIED"), vacant: c("VACANT"), onNotice: c("ON_NOTICE"), blocked: c("BLOCKED") };
}
