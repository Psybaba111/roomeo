import { searchCity } from "./cities.ts";
import { readableDate } from "./dates.ts";
/** Digital move-in + deposit records: pure rules (flag, validation, masking, documents). */
type Env = Record<string, string | undefined>;
const procEnv = (): Env => (typeof process === "undefined" ? {} : process.env);

export function moveInEnabled(env: Env = procEnv()): boolean {
  const v = env.ROOMEO_MOVEIN_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

export const ID_TYPES = { AADHAAR: "Aadhaar", OFFICE_ID: "Office ID", PASSPORT: "Passport", DL: "Driving licence", VOTER: "Voter ID" } as const;
export type IdType = keyof typeof ID_TYPES;
export const DEPOSIT_REFUND_DAYS = 7;
export const MIN_STAY_MONTHS = 3;
export const NOTICE_DAYS = 30;

export const DEFAULT_HOUSE_RULES = [
  "Check-in needs a government ID and office/college ID, plus local police verification where the city requires it.",
  "Rent is due by the 5th of every month.",
  "Deposit is one month's rent, refunded within 7 days of checkout after any agreed deductions.",
  "Gate closes at 11 PM. Late shift? Tell the caretaker.",
  "Visitors 9 AM-9 PM in common areas only, logged at the gate. No overnight guests without ID and notice.",
  "No smoking, alcohol or drugs inside the premises.",
  "Quiet hours 10:30 PM-7 AM.",
  "Keep wet and dry waste separate and common areas clean.",
  "CCTV covers the entrance and common areas only, never rooms.",
].join("\n");

const digits = (s: string) => s.replace(/\D/g, "");

/** Validate an ID number and keep only what we store: the last 4 characters. */
export function idLast4(type: IdType, raw: string): string {
  const v = raw.replace(/[\s-]/g, "").toUpperCase();
  if (type === "AADHAAR") {
    if (!/^[2-9]\d{11}$/.test(v)) throw new Error("Aadhaar should be 12 digits (it never starts with 0 or 1).");
  } else if (!/^[A-Z0-9/]{4,24}$/.test(v)) throw new Error("That ID number looks off.");
  return v.slice(-4);
}

/** "XXXX XXXX 1234" for Aadhaar, "••••1234" for the rest. */
export function maskId(type: string, last4: string): string {
  return type === "AADHAAR" ? `XXXX XXXX ${last4}` : `XXXX${last4}`;
}

/** Is the resident's home city the same as the property's city? Any city, normalised spellings. */
export function isFromCity(homeCity: string, propertyCity: string): boolean {
  const h = searchCity(homeCity);
  const p = searchCity(propertyCity);
  return Boolean(h) && h === p;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function refundDueOn(checkout: string): string {
  return addDays(checkout, DEPOSIT_REFUND_DAYS);
}

export type DeductionLite = { amount_inr: number };
export function depositBalance(amount: number, deductions: DeductionLite[]): number {
  return Math.max(0, amount - deductions.reduce((s, d) => s + Number(d.amount_inr), 0));
}

/** Overdue once the refund date has passed without a refund. */
export function depositStatusLabel(d: { status: string; refund_due_on: string | null }, todayIso: string): string {
  if (d.status === "REFUNDED") return "Refunded ✅";
  if (d.status === "REFUND_DUE") return d.refund_due_on && d.refund_due_on < todayIso ? "Refund overdue ⚠️" : `Refund due by ${d.refund_due_on}`;
  return "Held safely 🔒";
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type MoveInDetails = {
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string | null;
  occupation: string;
  employer: string;
  homeAddress: string;
  homeCity: string;
  homeState: string;
  homePincode: string;
  emergencyName: string;
  emergencyPhone: string;
  idType: IdType;
  idLast4: string;
};

export function parseDetails(input: unknown): MoveInDetails {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const fullName = str(o.fullName, 80);
  if (fullName.length < 2) throw new Error("Add your full name as on your ID.");
  const phone = digits(str(o.phone, 20)).slice(-10);
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error("Add a 10-digit Indian mobile number.");
  const homeAddress = str(o.homeAddress, 300);
  const homeCity = str(o.homeCity, 60);
  const homeState = str(o.homeState, 60);
  const homePincode = digits(str(o.homePincode, 10));
  if (homeAddress.length < 8 || !homeCity || !homeState) throw new Error("Add your full permanent home address.");
  if (!/^\d{6}$/.test(homePincode)) throw new Error("Pincode should be 6 digits.");
  const idType = str(o.idType, 20) as IdType;
  if (!(idType in ID_TYPES)) throw new Error("Pick an ID type.");
  const dob = str(o.dateOfBirth, 10);
  const emergencyPhone = digits(str(o.emergencyPhone, 20)).slice(-10);
  return {
    fullName,
    phone,
    email: str(o.email, 120),
    dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null,
    occupation: str(o.occupation, 80),
    employer: str(o.employer, 120),
    homeAddress,
    homeCity,
    homeState,
    homePincode,
    emergencyName: str(o.emergencyName, 80),
    emergencyPhone: /^\d{10}$/.test(emergencyPhone) ? emergencyPhone : "",
    idType,
    idLast4: idLast4(idType, str(o.idNumber, 40)),
  };
}

/** ID photo: a JPEG/PNG/WebP data URL from the in-browser compressor, max ~400 KB. */
export function parseIdImage(dataUrl: unknown): { mime: string; base64: string } {
  const m = typeof dataUrl === "string" ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl) : null;
  if (!m) throw new Error("Upload a photo of your ID (JPG or PNG).");
  if (m[2].length > 550_000) throw new Error("That ID photo is too big. Try a smaller one.");
  return { mime: m[1], base64: m[2] };
}

export type AgreementInput = {
  ownerName: string;
  tenantName: string;
  propertyTitle: string;
  propertyAddress: string;
  bedLabel: string;
  rentInr: number;
  depositInr: number;
  startDate: string;
  /** IST date the agreement is made (signing date; today while still unsigned). */
  madeOn: string;
  minStayMonths: number;
  noticeDays: number;
  houseRules: string;
};

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

/** Leave-and-licence PG stay agreement. Same text is hashed at signing, shown on screen and printed to PDF. */
export function agreementText(a: AgreementInput): string[] {
  const rules = a.houseRules.split("\n").map((r) => r.trim()).filter(Boolean);
  return [
    "LEAVE AND LICENCE AGREEMENT (PAYING GUEST ACCOMMODATION)",
    `This agreement is made on ${readableDate(a.madeOn)} between ${a.ownerName} ("Licensor") and ${a.tenantName} ("Licensee").`,
    `1. Premises. The Licensor permits the Licensee to use ${a.bedLabel ? `bed ${a.bedLabel} at ` : "a bed at "}${a.propertyTitle}, ${a.propertyAddress} ("Premises") as a paying guest, on leave and licence basis only. This does not create any tenancy or lease, and no interest in the Premises passes to the Licensee.`,
    `2. Term. The licence starts on ${readableDate(a.startDate)}. Minimum stay is ${a.minStayMonths} months. After that it continues month to month until ended under clause 6.`,
    `3. Licence fee. ${inr(a.rentInr)} per month, payable in advance by the 5th of each month, by UPI or bank transfer.`,
    `4. Security deposit. ${inr(a.depositInr)}, interest free. Refunded within 7 days of checkout, less only deductions for unpaid dues or damage beyond normal wear, each recorded with a reason and photo.`,
    "5. Use. The Premises are for residence only. The Licensee will not sublet, share, or allow anyone else to stay, and will follow the house rules below.",
    `6. Notice. Either party may end this licence with ${a.noticeDays} days' written notice (in-app notice counts). If the Licensee leaves before the minimum stay or without notice, the licence fee for the shortfall in notice may be adjusted from the deposit.`,
    "7. Police verification. The Licensee consents to their details and ID being shared with the jurisdictional police station for tenant verification as required by the local police.",
    "8. Termination. The Licensor may end the licence immediately for illegal activity, violence, or repeated breach of house rules.",
    "9. Governing law. Laws of India; courts where the property is located.",
    "HOUSE RULES",
    ...rules.map((r, i) => `${i + 1}. ${r}`),
  ];
}

export type PoliceFormInput = {
  details: Omit<MoveInDetails, "idLast4"> & { idMasked: string };
  outsideMangaluru: boolean;
  owner: { name: string; phone: string; address: string };
  propertyAddress: string;
  startDate: string;
};

/** Local police tenant/PG resident information form, for the owner to submit at the local station. */
export function policeFormLines(f: PoliceFormInput) {
  const d = f.details;
  return [
    { text: "MANGALURU CITY POLICE", size: 14, bold: true },
    { text: "Tenant / Paying Guest Resident Information Form", size: 12, bold: true },
    { text: "To be submitted by the owner at the jurisdictional police station.", size: 9 },
    { text: "A. RESIDENT", bold: true, gap: 10 },
    { text: `Full name: ${d.fullName}` },
    { text: `Date of birth: ${d.dateOfBirth ?? "________"}` },
    { text: `Mobile: ${d.phone}    Email: ${d.email || "-"}` },
    { text: `Occupation: ${d.occupation || "-"}    Employer / college: ${d.employer || "-"}` },
    { text: `Permanent home address: ${d.homeAddress}, ${d.homeCity}, ${d.homeState} - ${d.homePincode}` },
    { text: `Emergency contact: ${d.emergencyName || "-"} ${d.emergencyPhone || ""}` },
    { text: `ID proof: ${ID_TYPES[d.idType]} no. ${d.idMasked} (copy attached by owner)` },
    { text: `From outside this city: ${f.outsideMangaluru ? "YES - home town police clearance required" : "No"}`, bold: f.outsideMangaluru },
    { text: "B. ACCOMMODATION", bold: true, gap: 10 },
    { text: `PG address: ${f.propertyAddress}` },
    { text: `Date of occupation: ${readableDate(f.startDate)}` },
    { text: "C. OWNER / LICENSOR", bold: true, gap: 10 },
    { text: `Name: ${f.owner.name}    Mobile: ${f.owner.phone || "-"}` },
    { text: `Address: ${f.owner.address}` },
    { text: "D. DECLARATION", bold: true, gap: 10 },
    { text: "I declare the above is true to the best of my knowledge. Attach: resident photo, ID copy, and (if from outside this city) home town police clearance." },
    { text: "Owner signature: ____________________     Resident signature: ____________________", gap: 24 },
    { text: "Date: ____________     Police station: ____________________", gap: 12 },
    { text: "For office use: Received by ____________  Verified on ____________", gap: 24, size: 9 },
  ];
}
