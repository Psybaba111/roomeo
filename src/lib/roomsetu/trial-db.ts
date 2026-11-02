// Database side of trial nights (migration 0023). Pure rules live in trial-nights.ts.
import type { Sql } from "@/lib/db";
import { istDate } from "./deal-agreement.ts";
import {
  TRIAL_FEE_INR,
  feeAfterTrialCredit,
  trialCreditEligible,
  trialFeeBreakdown,
  trialStayTotal,
  validCheckIn,
  validNightlyPrice,
  validNights,
} from "./trial-nights.ts";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

/** Owner turns trial nights on or off for one of their listings. */
export async function setListingTrial(sql: Sql, p: { listingId: string; ownerId: string; enabled: boolean; nightlyInr?: unknown }) {
  const price = p.enabled ? validNightlyPrice(p.nightlyInr) : null;
  const rows = await sql.query<Row>(
    `update listings set trial_nights_enabled = $3, trial_nightly_inr = coalesce($4, trial_nightly_inr)
     where id = $1 and owner_id = $2 returning id`,
    [p.listingId, p.ownerId, p.enabled, price],
  );
  if (!rows[0]) throw new Error("Only the owner can change trial nights.");
  return { enabled: p.enabled, nightlyInr: price };
}

export async function listingTrial(sql: Sql, listingId: string) {
  const r = (await sql.query<Row>(`select owner_id, trial_nights_enabled, trial_nightly_inr from listings where id = $1 and status = 'ACTIVE'`, [listingId]))[0];
  if (!r) return null;
  return { ownerId: s(r.owner_id), enabled: Boolean(r.trial_nights_enabled) && Number(r.trial_nightly_inr) > 0, nightlyInr: Number(r.trial_nightly_inr ?? 0) };
}

/**
 * Student books a trial. Creates the booking (FEE_PENDING) and a PENDING ₹99 UPI payment, or
 * returns the already-open one. The booking is confirmed when an admin approves the payment.
 */
export async function bookTrial(
  sql: Sql,
  p: { listingId: string; seekerId: string; checkIn: unknown; nights: unknown; ref: string; now?: Date },
) {
  const nights = validNights(p.nights);
  const checkIn = validCheckIn(p.checkIn, istDate(p.now ?? new Date()));
  const l = await listingTrial(sql, p.listingId);
  if (!l || !l.enabled) throw new Error("This room doesn't offer trial nights.");
  if (l.ownerId === p.seekerId) throw new Error("You can't book a trial at your own room.");
  const open = (await sql.query<Row>(
    `select id, status from trial_bookings where listing_id = $1 and seeker_id = $2 and status in ('FEE_PENDING','CONFIRMED')`,
    [p.listingId, p.seekerId],
  ))[0];
  let bookingId = s(open?.id);
  if (open && s(open.status) === "CONFIRMED") throw new Error("You already have a confirmed trial here.");
  if (!bookingId) {
    bookingId = crypto.randomUUID();
    await sql.query(
      `insert into trial_bookings (id, listing_id, seeker_id, owner_id, check_in, nights, nightly_inr, stay_total_inr)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [bookingId, p.listingId, p.seekerId, l.ownerId, checkIn, nights, l.nightlyInr, trialStayTotal(l.nightlyInr, nights)],
    );
  } else {
    await sql.query(`update trial_bookings set check_in = $2, nights = $3, nightly_inr = $4, stay_total_inr = $5 where id = $1 and status = 'FEE_PENDING'`,
      [bookingId, checkIn, nights, l.nightlyInr, trialStayTotal(l.nightlyInr, nights)]);
  }
  const f = trialFeeBreakdown();
  let pay = (await sql.query<Row>(
    `select id, ref, status, amount_inr from payments where trial_booking_id = $1 and kind = 'TRIAL_FEE' and status in ('PENDING','SUBMITTED') order by created_at desc limit 1`,
    [bookingId],
  ))[0];
  if (!pay) {
    const id = crypto.randomUUID();
    await sql.query(
      `insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, trial_booking_id)
       values ($1,$2,$3,$4,'PENDING','UPI',$5,'TRIAL_FEE',$6,$7)`,
      [id, p.seekerId, `Trial nights service fee ₹${f.total} incl. GST (₹${f.base.toFixed(2)} + ₹${f.gst.toFixed(2)} GST)`, TRIAL_FEE_INR, p.ref, p.listingId, bookingId],
    );
    await sql.query(`update trial_bookings set fee_payment_id = $2 where id = $1`, [bookingId, id]);
    pay = (await sql.query<Row>(`select id, ref, status, amount_inr from payments where id = $1`, [id]))[0];
  }
  const b = (await sql.query<Row>(`select check_in::text as check_in, nights, nightly_inr, stay_total_inr from trial_bookings where id = $1`, [bookingId]))[0];
  return {
    bookingId,
    checkIn: s(b.check_in),
    nights: Number(b.nights),
    nightlyInr: Number(b.nightly_inr),
    stayTotalInr: Number(b.stay_total_inr),
    paymentRef: s(pay.ref),
    paymentStatus: s(pay.status),
    feeInr: Number(pay.amount_inr),
  };
}

/** After admin approval of a TRIAL_FEE payment: confirm the booking. Returns ids to notify. */
export async function confirmTrialFromPayment(sql: Sql, paymentId: string) {
  const rows = await sql.query<Row>(
    `update trial_bookings b set status = 'CONFIRMED', confirmed_at = now()
     from payments p where p.id = $1 and p.kind = 'TRIAL_FEE' and p.status = 'PAID' and b.id = p.trial_booking_id and b.status = 'FEE_PENDING'
     returning b.id, b.seeker_id, b.owner_id, b.check_in::text as check_in, b.nights, b.stay_total_inr`,
    [paymentId],
  );
  return rows[0] ? { id: s(rows[0].id), seekerId: s(rows[0].seeker_id), ownerId: s(rows[0].owner_id), checkIn: s(rows[0].check_in), nights: Number(rows[0].nights), stayTotalInr: Number(rows[0].stay_total_inr) } : null;
}

/** Owner ticks "ID checked" when the student arrives. */
export async function markTrialIdChecked(sql: Sql, p: { bookingId: string; ownerId: string }) {
  const r = await sql.query<Row>(`update trial_bookings set id_checked_at = coalesce(id_checked_at, now()) where id = $1 and owner_id = $2 and status = 'CONFIRMED' returning id`, [p.bookingId, p.ownerId]);
  if (!r[0]) throw new Error("Only the owner of a confirmed trial can mark ID checked.");
  return { ok: true };
}

/**
 * Rohith, 2 Nov 2026: the ₹99 is never refunded and its credit is single-use. A credit used on a fee that was later
 * refunded (REFUND_DUE/REFUNDED) stays used; only a never-paid (CANCELLED) checkout frees it.
 * The newest paid trial of this seeker whose credit is still unused and which falls in the 14-day
 * window before `dealIssuedAt`. Any listing counts: the trial led to a deal on Roomeo.
 */
export async function findTrialCredit(sql: Sql, seekerId: string, dealIssuedAt: string | Date) {
  const issuedOn = istDate(dealIssuedAt);
  const rows = await sql.query<Row>(
    `select b.id, b.check_in::text as check_in, b.nights, b.created_at::text as created_at from trial_bookings b
     where b.seeker_id = $1 and b.status in ('CONFIRMED','COMPLETED')
       and not exists (select 1 from payments x where x.trial_credit_booking_id = b.id and x.status in ('PENDING','SUBMITTED','PAID','REFUND_DUE','REFUNDED'))
     order by b.check_in desc limit 10`,
    [seekerId],
  );
  for (const r of rows) {
    if (trialCreditEligible({ checkIn: s(r.check_in), nights: Number(r.nights), bookedOn: istDate(s(r.created_at)), dealIssuedOn: issuedOn })) return { bookingId: s(r.id) };
  }
  return null;
}

/** Tenant's ₹589 fee, minus ₹99 if a trial credit applies. */
export async function tenantFeeWithTrialCredit(sql: Sql, seekerId: string, feeTotalInr: number, dealIssuedAt: string | Date) {
  const credit = await findTrialCredit(sql, seekerId, dealIssuedAt);
  const f = feeAfterTrialCredit(feeTotalInr, Boolean(credit));
  return { ...f, bookingId: credit?.bookingId ?? null };
}

/** Operator view on the payments page. */
export async function adminTrialBookings(sql: Sql) {
  const rows = await sql.query<Row>(
    `select b.id, b.listing_id, l.title, b.check_in::text as check_in, b.nights, b.nightly_inr, b.stay_total_inr, b.status,
            b.id_checked_at::text as id_checked_at, p.ref, p.status as fee_status, coalesce(sp.full_name, b.seeker_id) as seeker,
            coalesce(op.full_name, b.owner_id) as owner,
            (select x.ref from payments x where x.trial_credit_booking_id = b.id and x.status in ('PENDING','SUBMITTED','PAID','REFUND_DUE','REFUNDED') limit 1) as credited_on
     from trial_bookings b left join listings l on l.id = b.listing_id left join payments p on p.id = b.fee_payment_id
     left join profiles sp on sp.user_id = b.seeker_id left join profiles op on op.user_id = b.owner_id
     order by b.created_at desc limit 200`,
  );
  return rows.map((r) => ({
    id: s(r.id), listingId: s(r.listing_id), title: s(r.title), checkIn: s(r.check_in), nights: Number(r.nights),
    nightlyInr: Number(r.nightly_inr), stayTotalInr: Number(r.stay_total_inr), status: s(r.status), idCheckedAt: s(r.id_checked_at),
    feeRef: s(r.ref), feeStatus: s(r.fee_status), seeker: s(r.seeker), owner: s(r.owner), creditedOn: s(r.credited_on),
  }));
}

/** Student's open (fee pending / confirmed) trial at this listing, so a reload shows it again. */
export async function myOpenTrial(sql: Sql, p: { listingId: string; seekerId: string }) {
  const r = (await sql.query<Row>(
    `select b.id, b.status, b.check_in::text as check_in, b.nights, b.nightly_inr, b.stay_total_inr, b.id_checked_at::text as id_checked_at,
            p.ref, p.id as pay_id, (select fi.number from fee_invoices fi where fi.payment_id = p.id) as invoice_no, p.status as pay_status, p.amount_inr
     from trial_bookings b left join payments p on p.id = b.fee_payment_id
     where b.listing_id = $1 and b.seeker_id = $2 and b.status in ('FEE_PENDING','CONFIRMED')
     order by b.created_at desc limit 1`,
    [p.listingId, p.seekerId],
  ))[0];
  if (!r) return null;
  return {
    bookingId: s(r.id), status: s(r.status), checkIn: s(r.check_in), nights: Number(r.nights), nightlyInr: Number(r.nightly_inr),
    stayTotalInr: Number(r.stay_total_inr), paymentRef: s(r.ref), paymentStatus: s(r.pay_status), feeInr: Number(r.amount_inr ?? TRIAL_FEE_INR),
    paymentId: s(r.pay_id), invoiceNo: s(r.invoice_no),
  };
}

/** Owner: confirmed trials at their listing (upcoming or arrived), for the "Mark ID checked" button. */
export async function ownerTrialBookings(sql: Sql, p: { listingId: string; ownerId: string }) {
  const rows = await sql.query<Row>(
    `select b.id, b.check_in::text as check_in, b.nights, b.stay_total_inr, b.id_checked_at::text as id_checked_at,
            coalesce(sp.full_name, 'Student') as seeker
     from trial_bookings b left join profiles sp on sp.user_id = b.seeker_id
     where b.listing_id = $1 and b.owner_id = $2 and b.status = 'CONFIRMED'
     order by b.check_in asc limit 50`,
    [p.listingId, p.ownerId],
  );
  return rows.map((r) => ({ id: s(r.id), checkIn: s(r.check_in), nights: Number(r.nights), stayTotalInr: Number(r.stay_total_inr), idCheckedAt: s(r.id_checked_at), seeker: s(r.seeker) }));
}
