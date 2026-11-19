// DB side of the owner-only / broker checks. Relative imports only so node tests run it on PGlite.
// No migration: the declaration is an audit_log row, "waiting for review" is a listings.status value
// (status is free text, no check constraint), and every flag is computed live from existing tables.
import type { Sql } from "../db.ts";
import {
  ACTIVE_LISTING_CAP,
  BROKER_REPORT_REASON,
  FLAG_LABEL,
  OWNER_DECLARATION,
  OWNER_DECLARATION_VERSION,
  PENDING_REVIEW,
  findContactDetails,
  sharedPhoneGroups,
  statusForNewListing,
  type FlagReason,
} from "./owner-only.ts";

/** Live (ACTIVE) beds this owner has, demo beds excluded. `exceptId` leaves one listing out (resume). */
export async function activeListingCount(sql: Sql, ownerId: string, exceptId = ""): Promise<number> {
  const r = await sql.query<{ n: number }>(
    `select count(*)::int as n from listings where owner_id = $1 and status = 'ACTIVE' and is_demo = false and id <> $2`,
    [ownerId, exceptId],
  );
  return Number(r[0]?.n ?? 0);
}

/** Status a brand new listing starts in: live, or waiting for review above the cap. */
export async function newListingStatus(sql: Sql, ownerId: string, cap = ACTIVE_LISTING_CAP) {
  return statusForNewListing(await activeListingCount(sql, ownerId), cap);
}

/**
 * What an owner's "make it live" (Resume) actually does: live while under the cap, otherwise it waits
 * for review. A bed already waiting for review can't be put live by the owner. Nothing is ever taken down.
 */
export async function ownerActivateStatus(sql: Sql, ownerId: string, listingId: string, cap = ACTIVE_LISTING_CAP): Promise<"ACTIVE" | typeof PENDING_REVIEW | "LOCKED"> {
  const cur = (await sql.query<{ status: string }>(`select status from listings where id = $1 and owner_id = $2`, [listingId, ownerId]))[0];
  if (cur?.status === PENDING_REVIEW) return "LOCKED";
  return statusForNewListing(await activeListingCount(sql, ownerId, listingId), cap);
}

/** The owner's declaration, kept in the audit log with its wording version. */
export async function recordOwnerDeclaration(sql: Sql, ownerId: string, listingId: string) {
  await sql.query(
    `insert into audit_log (id, actor_id, action, target_type, target_id, detail) values ($1, $2, 'listing.owner_declaration', 'listing', $3, $4)`,
    [crypto.randomUUID(), ownerId, listingId, `${OWNER_DECLARATION_VERSION}: ${OWNER_DECLARATION}`],
  );
}

export type FlaggedAccount = { userId: string; name: string; reasons: FlagReason[]; detail: string[]; liveBeds: number };
export type FlaggedListing = { id: string; title: string; ownerId: string; owner: string; status: string; reasons: FlagReason[]; detail: string[] };

/** Operator "mark reviewed" for one flag; it stays hidden until something new happens. */
export async function markFlagReviewed(sql: Sql, adminId: string, targetType: "account" | "listing", targetId: string, reason: FlagReason) {
  await sql.query(
    `insert into audit_log (id, actor_id, action, target_type, target_id, detail) values ($1, $2, 'trust_flag.reviewed', $3, $4, $5)`,
    [crypto.randomUUID(), adminId, targetType, targetId, reason],
  );
}

/**
 * Accounts and listings an operator should look at. Flag, never block: none of this changes what the
 * owner can see or do. Sources: shared phones (profiles.phone_e164 / mobile), more live beds than the cap,
 * contact details in a listing's text, broker reports, beds waiting for review.
 */
export async function flaggedForReview(sql: Sql, cap = ACTIVE_LISTING_CAP): Promise<{ accounts: FlaggedAccount[]; listings: FlaggedListing[] }> {
  const reviewed = new Set(
    (await sql.query<{ k: string }>(`select target_type || ':' || target_id || ':' || detail as k from audit_log where action = 'trust_flag.reviewed'`)).map((r) => r.k),
  );
  const profiles = await sql.query<{ user_id: string; full_name: string; phone_e164: string | null; mobile: string | null; is_demo: boolean }>(
    `select user_id, coalesce(full_name, '') as full_name, phone_e164, mobile, is_demo from profiles where coalesce(account_status, 'ACTIVE') <> 'SUSPENDED'`,
  );
  const nameOf = new Map(profiles.map((p) => [p.user_id, p.full_name]));
  const shared = sharedPhoneGroups(profiles.filter((p) => !p.is_demo).map((p) => ({ userId: p.user_id, phone: p.phone_e164, mobile: p.mobile })));
  const live = await sql.query<{ owner_id: string; n: number }>(
    `select owner_id, count(*)::int as n from listings where status = 'ACTIVE' and is_demo = false group by owner_id having count(*) > $1`,
    [cap],
  );
  const accounts = new Map<string, FlaggedAccount>();
  const acct = (id: string) => {
    if (!accounts.has(id)) accounts.set(id, { userId: id, name: nameOf.get(id) ?? "", reasons: [], detail: [], liveBeds: 0 });
    return accounts.get(id)!;
  };
  for (const [u, others] of shared) {
    if (reviewed.has(`account:${u}:SHARED_PHONE`)) continue;
    const a = acct(u);
    a.reasons.push("SHARED_PHONE");
    a.detail.push(`Same phone as ${others.length} other account${others.length > 1 ? "s" : ""}: ${others.map((o) => nameOf.get(o) || o).join(", ")}`);
  }
  for (const r of live) {
    if (reviewed.has(`account:${r.owner_id}:OVER_CAP`)) continue;
    const a = acct(r.owner_id);
    a.reasons.push("OVER_CAP");
    a.liveBeds = Number(r.n);
    a.detail.push(`${r.n} live beds (cap ${cap})`);
  }
  const brokerUsers = await sql.query<{ target_id: string; n: number }>(
    `select target_id, count(*)::int as n from reports where category = $1 and status in ('OPEN','REVIEWING') and upper(target_type) in ('USER','ACCOUNT','PROFILE') group by target_id`,
    [BROKER_REPORT_REASON],
  );
  for (const r of brokerUsers) {
    if (reviewed.has(`account:${r.target_id}:BROKER_REPORT`)) continue;
    const a = acct(r.target_id);
    a.reasons.push("BROKER_REPORT");
    a.detail.push(`${r.n} broker report${r.n > 1 ? "s" : ""}`);
  }

  const rows = await sql.query<{ id: string; title: string; description: string; owner_id: string; status: string; broker_reports: number }>(
    `select l.id, l.title, l.description, l.owner_id, l.status,
            (select count(*)::int from reports r where r.target_id = l.id and upper(r.target_type) = 'LISTING' and r.category = $1 and r.status in ('OPEN','REVIEWING')) as broker_reports
     from listings l where l.status <> 'REMOVED' and l.is_demo = false order by l.created_at desc limit 500`,
    [BROKER_REPORT_REASON],
  );
  const listings: FlaggedListing[] = [];
  for (const l of rows) {
    const f: FlaggedListing = { id: l.id, title: l.title, ownerId: l.owner_id, owner: nameOf.get(l.owner_id) ?? "", status: l.status, reasons: [], detail: [] };
    const add = (reason: FlagReason, line: string) => {
      if (reviewed.has(`listing:${l.id}:${reason}`)) return;
      f.reasons.push(reason);
      f.detail.push(line);
    };
    if (l.status === PENDING_REVIEW) add("PENDING_REVIEW", FLAG_LABEL.PENDING_REVIEW);
    const kinds = [...new Set([...findContactDetails(l.title), ...findContactDetails(l.description)])];
    if (kinds.length) add("CONTACT_IN_TEXT", `Text has: ${kinds.join(", ")}`);
    if (Number(l.broker_reports) > 0) add("BROKER_REPORT", `${l.broker_reports} broker report${l.broker_reports > 1 ? "s" : ""}`);
    if (shared.has(l.owner_id)) add("SHARED_PHONE", "Owner's phone is used on another account");
    if (f.reasons.length) listings.push(f);
  }
  return { accounts: [...accounts.values()], listings };
}
