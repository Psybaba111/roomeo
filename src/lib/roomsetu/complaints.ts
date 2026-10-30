/** Complaints tracker + rent receipts: pure rules. */
type Env = Record<string, string | undefined>;
const procEnv = (): Env => (typeof process === "undefined" ? {} : process.env);

export function complaintsEnabled(env: Env = procEnv()): boolean {
  const v = env.ROOMEO_COMPLAINTS_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

export const CATEGORIES = {
  AC: "❄️ AC",
  ELECTRICAL: "💡 Electrical",
  PLUMBING: "🚿 Plumbing / water",
  WIFI: "📶 Wi-Fi",
  FOOD: "🍛 Food",
  CLEANING: "🧹 Cleaning",
  FURNITURE: "🛏️ Furniture",
  SECURITY: "🔐 Safety / security",
  OTHER: "🤔 Something else",
} as const;
export type Category = keyof typeof CATEGORIES;
export type Status = "OPEN" | "IN_PROGRESS" | "FIXED" | "CLOSED";
export const STATUS_LABEL: Record<Status, string> = { OPEN: "Open 🔴", IN_PROGRESS: "On it 🛠️", FIXED: "Fixed, confirm? ✅", CLOSED: "Closed 🙌" };

/** Allowed moves. Owner: OPEN→IN_PROGRESS→FIXED (or straight to FIXED). Tenant: FIXED→CLOSED (confirm) or FIXED→OPEN (not fixed). */
export function canMove(role: "owner" | "tenant", from: Status, to: Status): boolean {
  if (role === "owner") return (from === "OPEN" && (to === "IN_PROGRESS" || to === "FIXED")) || (from === "IN_PROGRESS" && to === "FIXED");
  return from === "FIXED" && (to === "CLOSED" || to === "OPEN");
}

/** Average hours from raised → fixed, over complaints that reached fixed. null when none. */
export function avgFixHours(rows: { created_at: string | Date; fixed_at: string | Date | null }[]): number | null {
  const done = rows.filter((r) => r.fixed_at);
  if (!done.length) return null;
  const ms = done.reduce((s, r) => s + (new Date(r.fixed_at as string).getTime() - new Date(r.created_at).getTime()), 0) / done.length;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export function fixTimeLabel(h: number | null): string {
  if (h == null) return "No fixes yet";
  if (h < 1) return "under an hour";
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

// ---------- Receipts ----------
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function two(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}
function three(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? two(r) : ""].filter(Boolean).join(" ");
}
/** Indian numbering: 1,25,000 → "One Lakh Twenty Five Thousand Rupees Only". */
export function rupeesInWords(n: number): string {
  n = Math.floor(n);
  if (n === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return `${parts.join(" ")} Rupees Only`;
}

export function monthPeriod(month: string): { from: string; to: string; label: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, label };
}

export function isMonth(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function normalizePan(raw: string): string {
  const v = raw.replace(/\s/g, "").toUpperCase();
  if (!v) return "";
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(v)) throw new Error("PAN should look like ABCDE1234F.");
  return v;
}

export type Receipt = {
  receiptNo: string;
  month: string;
  amountInr: number;
  paidOn: string;
  method: string;
  ref: string;
  tenantName: string;
  landlordName: string;
  landlordPan: string;
  landlordAddress: string;
  propertyAddress: string;
  source: "autopay" | "manual";
};

export function receiptNo(id: string, month: string): string {
  return `RR-${month.replace("-", "")}-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** HRA-friendly rent receipt lines for the PDF. */
export function receiptLines(r: Receipt) {
  const p = monthPeriod(r.month);
  const amt = `₹${r.amountInr.toLocaleString("en-IN")}`;
  return [
    { text: "RENT RECEIPT", size: 16, bold: true },
    { text: `Receipt no. ${r.receiptNo}    Date: ${r.paidOn}`, size: 9 },
    { text: `Received with thanks from ${r.tenantName} the sum of ${amt} (${rupeesInWords(r.amountInr)}) towards rent / paying-guest charges for the period ${p.from} to ${p.to} (${p.label}).`, gap: 14 },
    { text: `Property: ${r.propertyAddress}`, gap: 8 },
    { text: `Payment mode: ${r.method}${r.ref ? `  ·  Reference: ${r.ref}` : ""}${r.source === "autopay" ? "  ·  via UPI AutoPay" : ""}` },
    { text: "LANDLORD", bold: true, gap: 14 },
    { text: `Name: ${r.landlordName}` },
    { text: `PAN: ${r.landlordPan || "Not provided (required by employers if annual rent exceeds Rs. 1,00,000)"}` },
    { text: `Address: ${r.landlordAddress || "-"}` },
    { text: "Landlord signature: ______________________________", gap: 30 },
    ...(r.method === "CASH" && r.amountInr > 5000 ? [{ text: "Cash payment above Rs. 5,000: affix revenue stamp and sign across it.", size: 9, gap: 6 }] : []),
    { text: "Generated by Roomeo. Valid for HRA claims when signed by the landlord.", size: 8, gap: 20 },
  ];
}
