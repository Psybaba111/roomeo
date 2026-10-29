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
