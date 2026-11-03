import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { bool, num, str } from "@/lib/roomsetu/map";
import { rolesAreAdmin } from "@/lib/roomsetu/admin-gate";
import { dealWaiting, inboxBadgeCount } from "@/lib/roomsetu/owner-inbox";

/** Read-only. Counts for the nav badge and whether this account is an owner. */
export const getInboxSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const u = context.userId;
    const [beds] = await sql<{ n: number }>`select count(*)::int as n from listings where owner_id = ${u} and status <> 'REMOVED'`;
    const [reqs] = await sql<{ n: number }>`select count(*)::int as n from applications where host_id = ${u} and status = 'PENDING'`;
    const [chats] = await sql<{ n: number }>`
      select count(distinct m.conversation_id)::int as n from messages m
      join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = ${u}
      where m.sender_id <> ${u} and m.created_at > coalesce(cm.last_read_at, '1970-01-01')`;
    const [fees] = await sql<{ n: number }>`
      select count(*)::int as n from applications a
      join payments p on p.user_id = a.seeker_id and p.listing_id = a.listing_id and p.kind = 'SUCCESS_FEE' and p.status = 'SUBMITTED'
      where a.host_id = ${u} and a.status = 'ACCEPTED'`;
    const listingCount = num(beds?.n);
    return {
      isOwner: listingCount > 0,
      listingCount,
      badge: inboxBadgeCount({ newRequests: num(reqs?.n), unreadChats: num(chats?.n), paymentsWaiting: num(fees?.n) }),
    };
  });

/** Read-only. Accepted deals on the owner's beds that still wait on a signature or fee. */
export const getOwnerDeals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const u = context.userId;
    const profile = await sql<{ account_status: string }>`select account_status from profiles where user_id = ${u}`;
    const roles = await sql<{ role: string }>`select role from profile_roles where user_id = ${u}`;
    const isAdmin = rolesAreAdmin(roles.map((r) => String(r.role)), String(profile[0]?.account_status ?? ""));
    const rows = await sql.query<Record<string, unknown>>(
      `select a.id, a.listing_id, l.title, ps.full_name as seeker_name,
              d.issued_at is not null as issued, d.cancelled_at is not null as cancelled,
              d.owner_signed_at is not null as owner_signed, d.seeker_signed_at is not null as seeker_signed,
              (select p.status from payments p where p.user_id = a.seeker_id and p.listing_id = a.listing_id
                 and p.kind = 'SUCCESS_FEE' order by p.created_at desc limit 1) as fee_status
       from applications a
       join listings l on l.id = a.listing_id
       join profiles ps on ps.user_id = a.seeker_id
       left join deal_agreements d on d.application_id = a.id
       where a.host_id = $1 and a.status = 'ACCEPTED'
       order by a.created_at desc limit 30`,
      [u],
    );
    const deals = rows
      .map((r) => {
        const w = dealWaiting({
          issued: bool(r.issued),
          cancelled: bool(r.cancelled),
          ownerSigned: bool(r.owner_signed),
          seekerSigned: bool(r.seeker_signed),
          feeStatus: str(r.fee_status),
        });
        return w ? { id: str(r.id), listingId: str(r.listing_id), title: str(r.title), seekerName: str(r.seeker_name), ...w } : null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
    const beds = await sql.query<Record<string, unknown>>(
      `select l.id, l.title, l.status, l.monthly_rent, coalesce(l.views, 0) as views
       from listings l where l.owner_id = $1 and l.status <> 'REMOVED' order by l.created_at desc`,
      [u],
    );
    return {
      isAdmin,
      deals,
      beds: beds.map((b) => ({ id: str(b.id), title: str(b.title), status: str(b.status), rent: num(b.monthly_rent), views: num(b.views) })),
    };
  });
