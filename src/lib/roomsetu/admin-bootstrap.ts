// Safe admin bootstrap. No credentials live here: a person must already have a Roomeo account,
// and either an operator with DB access grants the role (CLI), or the one-time first-run claim
// is used while ADMIN_BOOTSTRAP_TOKEN is set and no admin exists yet.
import { timingSafeEqual } from "node:crypto";

export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
export const ADMIN_ROLE = "SUPER_ADMIN";
const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

/** Normalise a phone to +91XXXXXXXXXX (10-digit Indian numbers), else keep digits with a +. */
export function normalisePhone(input: string): string | null {
  const d = input.replace(/[^\d]/g, "");
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  if (d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}

export type Identifier = { kind: "email"; value: string } | { kind: "phone"; value: string };

export function parseIdentifier(raw: unknown): Identifier {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) throw new Error("Give an email or a phone number.");
  if (v.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error("That email doesn't look right.");
    return { kind: "email", value: v.toLowerCase() };
  }
  const p = normalisePhone(v);
  if (!p) throw new Error("That phone number doesn't look right.");
  return { kind: "phone", value: p };
}

/** Find exactly one existing account. Phone matches only a verified phone. */
export async function findUser(q: Query, id: Identifier): Promise<{ userId: string; name: string }> {
  const rows =
    id.kind === "email"
      ? await q(`select u.id as user_id, coalesce(p.full_name, u.name) as name from "user" u join profiles p on p.user_id = u.id where lower(u.email) = $1`, [id.value])
      : await q(`select user_id, full_name as name from profiles where phone_e164 = $1 and phone_verified_at is not null`, [id.value]);
  if (rows.length === 0) throw new Error(id.kind === "email" ? "No Roomeo account with that email. Sign up on the site first." : "No account with that verified phone. Sign up and verify the phone first.");
  if (rows.length > 1) throw new Error("More than one account matches. Use the email instead.");
  return { userId: String(rows[0].user_id), name: String(rows[0].name ?? "") };
}

export async function adminCount(q: Query): Promise<number> {
  const r = await q(`select count(*)::int as n from profile_roles where role = any($1)`, [ADMIN_ROLES]);
  return Number(r[0]?.n ?? 0);
}

/** Grant the admin role. Idempotent. Returns whether it was newly granted. */
export async function grantAdmin(q: Query, userId: string): Promise<{ granted: boolean }> {
  const r = await q(`insert into profile_roles (user_id, role) values ($1, $2) on conflict do nothing returning user_id`, [userId, ADMIN_ROLE]);
  return { granted: r.length > 0 };
}

export async function revokeAdmin(q: Query, userId: string): Promise<{ revoked: boolean }> {
  const r = await q(`delete from profile_roles where user_id = $1 and role = any($2) returning user_id`, [userId, ADMIN_ROLES]);
  return { revoked: r.length > 0 };
}

/** Constant-time token compare. Short or unset configured tokens never match. */
export function tokenMatches(configured: string | undefined, given: unknown): boolean {
  const c = (configured ?? "").trim();
  if (c.length < 24 || typeof given !== "string") return false;
  const a = Buffer.from(c);
  const b = Buffer.from(given.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * First-run claim: only while ADMIN_BOOTSTRAP_TOKEN (24+ chars) is set, only when no admin
 * exists yet, only for a signed-in account with a verified phone, and only with the right token.
 */
export async function claimFirstAdmin(
  q: Query,
  p: { configuredToken: string | undefined; givenToken: unknown; userId: string },
): Promise<{ ok: true }> {
  if ((p.configuredToken ?? "").trim().length < 24) throw new Error("Admin bootstrap is off.");
  if ((await adminCount(q)) > 0) throw new Error("An admin already exists. Ask them to grant you access.");
  if (!tokenMatches(p.configuredToken, p.givenToken)) throw new Error("That bootstrap token is wrong.");
  const me = await q(`select phone_verified_at from profiles where user_id = $1`, [p.userId]);
  if (!me[0]) throw new Error("Finish your profile first.");
  if (!me[0].phone_verified_at) throw new Error("Verify your phone first.");
  await grantAdmin(q, p.userId);
  return { ok: true };
}
