import { isRoomieType, type RoomieTypeKey } from "./roomie-quiz.ts";

/**
 * ROOMEO_WAITLIST_MODE: pre-launch mode (quiz + waitlist on the homepage, search hidden).
 * Only an explicit "true"/"1"/"on" turns it on. Unset ⇒ off everywhere ⇒ today's behaviour.
 */
export function waitlistModeOn(env: Record<string, string | undefined>): boolean {
  const v = (env.ROOMEO_WAITLIST_MODE ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

export const WAITLIST_ROLES = [
  { value: "tenant", label: "I need a bed" },
  { value: "owner", label: "I'm an owner / host" },
] as const;
export type WaitlistRole = (typeof WAITLIST_ROLES)[number]["value"];
export const WAITLIST_SOURCES = ["home", "waitlist_page", "quiz"] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

export const WAITLIST_CONSENT =
  "I agree that Roomeo can store these details and contact me by email, SMS or WhatsApp about the launch and beds or tenants near me. I can ask to be removed any time.";

export type WaitlistInput = {
  name: string;
  email: string | null;
  phone: string | null;
  city: string;
  role: WaitlistRole;
  roomieType: RoomieTypeKey | null;
  source: WaitlistSource;
};

export class WaitlistError extends Error {}

const clean = (v: unknown, max: number) =>
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Indian mobile: accepts +91 / 0 prefixes, spaces and dashes; returns the 10 digits or null. */
export function normalizePhone(v: string): string | null {
  const d = v.replace(/[\s()-]/g, "").replace(/^\+?91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function normalizeEmail(v: string): string | null {
  const e = v.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

/** One "Email or WhatsApp number" field → {email} or {phone}. */
export function splitContact(v: string): { email: string | null; phone: string | null } {
  const s = v.trim();
  if (s.includes("@")) return { email: normalizeEmail(s), phone: null };
  return { email: null, phone: normalizePhone(s) };
}

export function validateWaitlist(input: unknown): WaitlistInput {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  if (o.consent !== true) throw new WaitlistError("Tick the box so we can keep your spot and message you.");
  const name = clean(o.name, 80);
  if (!name) throw new WaitlistError("Add your name.");
  const contact = splitContact(clean(o.contact, 254));
  if (!contact.email && !contact.phone) throw new WaitlistError("Add a valid email or 10-digit mobile number.");
  const city = clean(o.city, 60);
  if (!city || !/^[\p{L} .'-]+$/u.test(city)) throw new WaitlistError("Add your city.");
  const role = o.role === "owner" ? "owner" : o.role === "tenant" ? "tenant" : null;
  if (!role) throw new WaitlistError("Pick tenant or owner / host.");
  const roomieType = isRoomieType(o.roomieType) ? o.roomieType : null;
  const source = (WAITLIST_SOURCES as readonly string[]).includes(String(o.source)) ? (o.source as WaitlistSource) : "home";
  return { name, ...contact, city, role, roomieType, source };
}

export type WaitlistRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string;
  role: string;
  roomieType: string | null;
  source: string;
  createdAt: string;
};

/** CSV for the admin download. Cells that could run as spreadsheet formulas are prefixed with '. */
export function waitlistCsv(rows: WaitlistRow[]): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["created_at", "name", "email", "phone", "city", "role", "roomie_type", "source"];
  const lines = rows.map((r) => [r.createdAt, r.name, r.email, r.phone, r.city, r.role, r.roomieType, r.source].map(cell).join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}

/** Who may still use search / listing pages while waitlist mode is on. */
export function waitlistAllows(page: "search" | "listing", who: { signedIn: boolean; isAdmin: boolean }): boolean {
  if (who.isAdmin) return true;
  return page === "listing" && who.signedIn; // signed-in people keep listing pages for existing deals
}
