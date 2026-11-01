/** GST invoice maths + seller details for the one-time success fee. Pure, no DB. */
export const SELLER = {
  name: "Athiti Hospitality Services Private Limited",
  gstin: "29ABFCA1830K1ZM",
  state: "Karnataka",
  stateCode: "29",
  address: "62 MPT Road, Bunder, Mangaluru 575001, Karnataka",
  sac: "998599", // other support services (platform / facilitation). Confirm with the CA.
} as const;

const CITY_STATE: Record<string, string> = {
  bengaluru: "Karnataka", bangalore: "Karnataka", mangaluru: "Karnataka", mangalore: "Karnataka", mysuru: "Karnataka", mysore: "Karnataka", udupi: "Karnataka", hubballi: "Karnataka",
  chennai: "Tamil Nadu", hyderabad: "Telangana", kochi: "Kerala", mumbai: "Maharashtra", pune: "Maharashtra", delhi: "Delhi", gurugram: "Haryana", noida: "Uttar Pradesh", chandigarh: "Chandigarh", goa: "Goa",
};
/** Buyer state from their profile city; null when we can't tell. */
export function stateForCity(city: string | null | undefined): string | null {
  return CITY_STATE[String(city ?? "").trim().toLowerCase()] ?? null;
}

export type InvoiceAmounts = { taxable: number; cgst: number; sgst: number; igst: number; total: number; roundOff: number; paid: number; intraState: boolean; placeOfSupply: string };

/**
 * All in paise. Intra-state (buyer in Karnataka, or state unknown → place of supply = Karnataka): CGST 9% + SGST 9%.
 * Buyer state known and outside Karnataka: IGST 18%. Round-off = whole-rupee amount paid minus exact total.
 */
export function invoiceAmounts(baseInr: number, buyerState: string | null, paidInr: number): InvoiceAmounts {
  const taxable = Math.round(baseInr * 100);
  const intraState = !buyerState || buyerState === SELLER.state;
  const cgst = intraState ? Math.round(taxable * 0.09) : 0;
  const sgst = intraState ? Math.round(taxable * 0.09) : 0;
  const igst = intraState ? 0 : Math.round(taxable * 0.18);
  const total = taxable + cgst + sgst + igst;
  const paid = Math.round(paidInr * 100);
  return { taxable, cgst, sgst, igst, total, roundOff: paid - total, paid, intraState, placeOfSupply: intraState ? SELLER.state : (buyerState as string) };
}

/**
 * GST-inclusive split for an amount that is not base + 18% of a round base (e.g. ₹490 after the ₹99 trial
 * credit): taxable = paid / 1.18 to the paisa, tax = the rest, so there is no round-off.
 */
export function invoiceAmountsInclusive(paidInr: number, buyerState: string | null): InvoiceAmounts {
  const paid = Math.round(paidInr * 100);
  const taxable = Math.round(paid / 1.18);
  const tax = paid - taxable;
  const intraState = !buyerState || buyerState === SELLER.state;
  const cgst = intraState ? Math.floor(tax / 2) : 0;
  const sgst = intraState ? tax - cgst : 0;
  const igst = intraState ? 0 : tax;
  return { taxable, cgst, sgst, igst, total: paid, roundOff: 0, paid, intraState, placeOfSupply: intraState ? SELLER.state : (buyerState as string) };
}

/** Indian financial year label in IST, e.g. 2026-27. */
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** RMO/2026-27/000001 — one running series per financial year label (sequence never reused). */
export function invoiceNumber(seq: number, d: Date): string {
  return `RMO/${financialYear(d)}/${String(seq).padStart(6, "0")}`;
}

export const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

const GST_STATE: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};
/** 15-char GSTIN: 2-digit state, PAN (5 letters, 4 digits, 1 letter), entity, Z, check char. */
export const GSTIN_RE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export function normalizeGstin(v: string | null | undefined): string | null {
  const g = String(v ?? "").replace(/\s+/g, "").toUpperCase();
  return g && GSTIN_RE.test(g) && GST_STATE[g.slice(0, 2)] ? g : null;
}
export function stateForGstin(g: string | null | undefined): string | null {
  const n = normalizeGstin(g);
  return n ? GST_STATE[n.slice(0, 2)] : null;
}
/** Buyer state: GSTIN wins, then profile city; unknown → null (place of supply defaults to Karnataka). */
export function buyerState(gstin: string | null | undefined, city: string | null | undefined): string | null {
  return stateForGstin(gstin) ?? stateForCity(city);
}

export type InvoiceView = {
  number: string; issuedAt: string; buyerName: string; buyerEmail: string; buyerPhone: string; buyerGstin: string; buyerState: string; placeOfSupply: string;
  taxable: number; cgst: number; sgst: number; igst: number; total: number; roundOff: number; paidInr: number; ref: string; utr: string; purpose: string; trialCreditInr?: number;
};

/** Invoice date in IST, e.g. 01 Nov 2026. */
export function istInvoiceDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

/** Lines for the downloadable PDF (pdf.ts swaps the rupee sign for Rs.). */
export function invoicePdfLines(v: InvoiceView): { text: string; size?: number; bold?: boolean; gap?: number }[] {
  const L: { text: string; size?: number; bold?: boolean; gap?: number }[] = [];
  const amt = (label: string, p: number) => L.push({ text: `${label}: ${rupees(p)}` });
  L.push({ text: "TAX INVOICE", size: 16, bold: true });
  L.push({ text: `Invoice no.: ${v.number}`, bold: true, gap: 6 });
  L.push({ text: `Invoice date: ${istInvoiceDate(v.issuedAt)} (IST)` });
  L.push({ text: "Supplier", bold: true, gap: 10 });
  L.push({ text: SELLER.name });
  L.push({ text: SELLER.address });
  L.push({ text: `GSTIN: ${SELLER.gstin} | State: ${SELLER.state} (${SELLER.stateCode})` });
  L.push({ text: "Billed to", bold: true, gap: 10 });
  L.push({ text: v.buyerName });
  if (v.buyerEmail) L.push({ text: `Email: ${v.buyerEmail}` });
  if (v.buyerPhone) L.push({ text: `Phone: ${v.buyerPhone}` });
  L.push({ text: `GSTIN: ${v.buyerGstin || "Not provided (unregistered)"}` });
  L.push({ text: `State: ${v.buyerState || "Not given"} | Place of supply: ${v.placeOfSupply}` });
  L.push({ text: "Description", bold: true, gap: 10 });
  L.push({ text: `Roomeo platform fee, one-time | SAC ${SELLER.sac} | Qty 1` });
  amt("Taxable value", v.taxable);
  if (v.igst) amt("IGST @ 18%", v.igst);
  else { amt("CGST @ 9%", v.cgst); amt("SGST @ 9%", v.sgst); }
  amt("Invoice total", v.total);
  if (v.roundOff) amt("Round off", v.roundOff);
  if (v.trialCreditInr) L.push({ text: `Trial credit applied: -${rupees(v.trialCreditInr * 100)} (₹99 trial fee already paid and invoiced separately)` });
  L.push({ text: `Amount paid: ${rupees(v.paidInr * 100)}`, bold: true });
  L.push({ text: `Paid by UPI | UTR: ${v.utr || "-"} | Roomeo ref: ${v.ref}`, gap: 6 });
  L.push({ text: "Tax payable on reverse charge: No", gap: 6 });
  L.push({ text: `Roomeo is a service of ${SELLER.name}. Computer-generated invoice, no signature needed.`, size: 8, gap: 14 });
  return L;
}
