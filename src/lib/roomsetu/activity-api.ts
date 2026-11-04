import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { bool, cardPhoto, num, str } from "@/lib/roomsetu/map";
import { pricingConfig } from "@/lib/roomsetu/pricing";
import { feeWithGst } from "@/lib/roomsetu/deal-agreement";
import type { DealFacts } from "@/lib/roomsetu/activity";

/**
 * Read-only. Every request this person sent (they are the renter), with the one
 * agreement/move-in snapshot the Activity row needs to name its current step.
 *
 * Nothing here writes: no status transitions, no fee amounts invented. The fee
 * total is the amount already on the payment row when one exists, else the
 * published ₹499 + GST — the same number dealSteps() prints everywhere.
 */
export const getActivityDeals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const cfg = pricingConfig();
    const feeOn = cfg.successFeeEnabled && cfg.successFeeTenantInr > 0;
    const listTotal = feeWithGst(cfg.successFeeTenantInr).total;

    const rows = await sql.query<Record<string, unknown>>(
      `select a.id, a.status, a.note, a.listing_id, a.host_id, a.seeker_id,
              to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD') as created_on,
              l.title, l.city_name, l.locality_name, l.monthly_rent, l.deposit, l.is_demo, l.room_type, l.furnished,
              po.full_name as owner_name,
              (select i.url from listing_images i where i.listing_id = l.id order by i.sort_order limit 1) as photo,
              d.seeker_signed_at is not null as seeker_signed,
              d.issued_at is not null as issued,
              d.cancelled_at is not null as cancelled,
              mi.confirmed_at is not null as moved_in,
              (select p.status from payments p where p.agreement_id = d.id and p.user_id = a.seeker_id
                 and p.kind = 'SUCCESS_FEE' order by p.created_at desc limit 1) as fee_status,
              (select p.amount_inr from payments p where p.agreement_id = d.id and p.user_id = a.seeker_id
                 and p.kind = 'SUCCESS_FEE' order by p.created_at desc limit 1) as fee_amount
       from applications a
       join listings l on l.id = a.listing_id
       join profiles po on po.user_id = a.host_id
       left join deal_agreements d on d.application_id = a.id
       left join move_ins mi on mi.application_id = a.id
       where a.seeker_id = $1
       order by a.created_at desc
       limit 50`,
      [context.userId],
    );

    const [hosting] = await sql<{ n: number }>`
      select count(*)::int as n from applications where host_id = ${context.userId} and status = 'PENDING'`;

    return {
      feeOn,
      listFeeTotal: listTotal,
      hostPending: num(hosting?.n),
      rows: rows.map((r) => {
        const paid = str(r.fee_status) === "PAID";
        const hasRow = Boolean(str(r.fee_status));
        const facts: DealFacts = {
          iSigned: bool(r.seeker_signed),
          issued: bool(r.issued),
          cancelled: bool(r.cancelled),
          feeOn,
          feePaid: paid,
          feeTotal: hasRow ? num(r.fee_amount) : listTotal,
          movedIn: bool(r.moved_in),
        };
        return {
          id: str(r.id),
          listingId: str(r.listing_id),
          title: str(r.title),
          city: str(r.city_name),
          locality: str(r.locality_name),
          rent: num(r.monthly_rent),
          deposit: num(r.deposit),
          photo: r.photo ? cardPhoto(str(r.photo), 240) : null,
          status: str(r.status),
          mine: true as const,
          otherName: str(r.owner_name) || "Owner",
          note: str(r.note),
          createdOn: str(r.created_on),
          demo: bool(r.is_demo),
          feeStatus: str(r.fee_status),
          facts,
        };
      }),
    };
  });
