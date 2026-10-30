/** Readable dates for user-facing screens and PDFs. All Roomeo dates are IST calendar dates. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_MS = 5.5 * 3600_000;

/** Today's calendar date in IST, as YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** "2026-10-30" (or a full ISO timestamp, read in IST) → "30 Oct 2026". Anything unparseable is returned as-is; empty → "". */
export function readableDate(v: string | null | undefined): string {
  if (!v) return "";
  let iso = v;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const t = new Date(v);
    if (Number.isNaN(t.getTime())) return v;
    iso = istToday(t);
  }
  const [y, m, d] = iso.split("-").map(Number);
  if (!m || m < 1 || m > 12 || !d) return v;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** First rent month (YYYY-MM) from the tenancy start that isn't paid yet. */
export function nextDueMonth(startDate: string | null | undefined, paidMonths: string[], now: Date = new Date()): string {
  const fallback = istToday(now).slice(0, 7);
  if (!startDate || !/^\d{4}-\d{2}/.test(startDate)) return fallback;
  const paid = new Set(paidMonths);
  let [y, m] = startDate.slice(0, 7).split("-").map(Number);
  for (let i = 0; i < 600; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (!paid.has(key)) return key;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return fallback;
}
