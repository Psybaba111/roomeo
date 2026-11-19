// Owner-only and broker-blocking checks (P0 broker plan, QA review 19 Nov 2026). Zero cost, no new vendor.
// Pure and client-safe so the form, the server and node tests share one copy of every rule.
//
// Policy: owners AND operators with legal control of the bed (e.g. a PG operator who leases the building)
// may list. Intermediaries (brokers, agents, anyone charging renters a brokerage) may not.
// Existing accounts are never locked out by these rules: anything they already have stays live and is
// flagged for an operator to review instead.

/** Bumped when the wording changes; stored with each declaration in the audit log. */
export const OWNER_DECLARATION_VERSION = "owner-v1-2026-11-19";

export const OWNER_DECLARATION =
  "I own this bed or have the legal right to rent it out, for example as the PG operator who leases the building. I am not a broker or agent, and I won't charge renters any brokerage.";

export const OWNER_ONLY_NOTICE =
  "Roomeo is for owners and operators only. Brokers and agents can't list here. Listings from brokers are removed, and renters can report one in a tap.";

export const DECLARATION_REQUIRED = "Tick the owner declaration to publish. Roomeo only lists beds from owners and operators.";

/** Active (live) listings an owner can have before a new one waits for an operator review. */
export const ACTIVE_LISTING_CAP = 3;

/** Listing status for a bed waiting on an operator (over the cap). Hidden from search and from renters. */
export const PENDING_REVIEW = "PENDING_REVIEW";

/** The report reason renters pick for a broker posing as an owner. */
export const BROKER_REPORT_REASON = "This is a broker";

/** New bed goes live, or waits for review when the owner already has `cap` live beds. */
export function statusForNewListing(activeCount: number, cap = ACTIVE_LISTING_CAP): "ACTIVE" | typeof PENDING_REVIEW {
  return activeCount >= cap ? PENDING_REVIEW : "ACTIVE";
}

export const CAP_REVIEW_LINE = `You already have ${ACTIVE_LISTING_CAP} live beds, so this one waits for a quick Roomeo review before it goes live. We usually check within a day.`;
export const PENDING_REVIEW_LOCKED = "This bed is waiting for a Roomeo review. We'll put it live once it's checked.";

export type ContactKind = "phone" | "email" | "whatsapp" | "link";

const PHONE = /(?:\+|\b)(?:91|0)?[\s.\-()]*[6-9](?:[\s.\-()]*\d){9}\b/;
const EMAIL = /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[a-z0-9-]+(?:\s*(?:\.|\(dot\)|\[dot\])\s*[a-z]{2,})+/i;
const WHATSAPP = /\b(?:wa\.me|chat\.whatsapp\.com|api\.whatsapp\.com)\b|\b(?:whats\s?app|watsapp|whatsap|wtsp|wp)\b[^a-z]{0,6}(?:me|us|on|at|no|number|\+?\d)/i;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:com|in|net|org|co|me|io|ly|link|site|online|app|xyz|page)\b(?:\/\S*)?/i;

/** Which kinds of contact details appear in a piece of listing text (empty = clean). */
export function findContactDetails(text: string): ContactKind[] {
  const t = String(text ?? "");
  const out: ContactKind[] = [];
  if (PHONE.test(t)) out.push("phone");
  if (EMAIL.test(t)) out.push("email");
  if (WHATSAPP.test(t)) out.push("whatsapp");
  // An email also looks like a domain; don't double report it.
  if (LINK.test(t.replace(new RegExp(EMAIL.source, "gi"), " "))) out.push("link");
  return out;
}

const KIND_WORD: Record<ContactKind, string> = { phone: "phone number", email: "email address", whatsapp: "WhatsApp link or number", link: "website link" };

/**
 * Friendly error when a title or description carries contact details, or "" when clean.
 * Renters reach owners through Roomeo chat, which keeps numbers private and blocks brokers working around it.
 */
export function contactDetailError(fields: { title?: string; description?: string }): string {
  for (const [name, value] of [["title", fields.title], ["description", fields.description]] as const) {
    const kinds = findContactDetails(value ?? "");
    if (kinds.length) {
      const what = kinds.map((k) => KIND_WORD[k]).join(" and ");
      return `Please take the ${what} out of the ${name}. Renters reach you through Roomeo chat, so your number stays private until you both agree to share it.`;
    }
  }
  return "";
}

/** Last 10 digits of an Indian mobile, for matching the same number across accounts ("" when not a mobile). */
export function phoneKey(raw: unknown): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  const ten = d.length >= 10 ? d.slice(-10) : "";
  return /^[6-9]\d{9}$/.test(ten) ? ten : "";
}

export type FlagReason = "SHARED_PHONE" | "OVER_CAP" | "CONTACT_IN_TEXT" | "BROKER_REPORT" | "PENDING_REVIEW";

export const FLAG_LABEL: Record<FlagReason, string> = {
  SHARED_PHONE: "Phone used on more than one account",
  OVER_CAP: `More than ${ACTIVE_LISTING_CAP} live beds`,
  CONTACT_IN_TEXT: "Contact details in the listing text",
  BROKER_REPORT: "Reported as a broker",
  PENDING_REVIEW: "Waiting for review (over the cap)",
};

/** Accounts sharing one phone (verified or not, profile phone or mobile): userId → the other user ids. */
export function sharedPhoneGroups(rows: { userId: string; phone?: unknown; mobile?: unknown }[]): Map<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const k of new Set([phoneKey(r.phone), phoneKey(r.mobile)])) {
      if (!k) continue;
      if (!byKey.has(k)) byKey.set(k, new Set());
      byKey.get(k)!.add(r.userId);
    }
  }
  const out = new Map<string, string[]>();
  for (const users of byKey.values()) {
    if (users.size < 2) continue;
    for (const u of users) out.set(u, [...new Set([...(out.get(u) ?? []), ...[...users].filter((x) => x !== u)])]);
  }
  return out;
}

/** Postgres unique violation on the one-verified-phone index (race between two accounts verifying one number). */
export function isVerifiedPhoneTaken(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string } | null;
  return Boolean(e && (e.constraint === "profiles_verified_phone_key" || /profiles_verified_phone_key/.test(String(e.message ?? ""))));
}
export const PHONE_TAKEN = "That number is already verified on another account.";
