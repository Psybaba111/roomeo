/** Profile form <-> API mapping (pure, so it can be regression-tested). */
export function numField(v: number | null | undefined): string {
  return v ? String(v) : "";
}
export function digitsOnly(v: string): string {
  return v.replace(/[^\d]/g, "");
}
export function toNumberOrNull(v: string): number | null {
  const d = digitsOnly(v);
  return d ? Number(d) : null;
}
