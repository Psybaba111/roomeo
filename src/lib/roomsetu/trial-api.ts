import { createServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { buildUpiLink, makeRef, upiPayee } from "@/lib/roomsetu/upi";
import { bookTrial, listingTrial, markTrialIdChecked, setListingTrial } from "@/lib/roomsetu/trial-db";
import { TRIAL_ARRIVAL_CHECKLIST, TRIAL_MAX_NIGHTS, trialFeeBreakdown, trialNightsEnabled } from "@/lib/roomsetu/trial-nights";

function rec(i: unknown): Record<string, unknown> {
  return i && typeof i === "object" ? (i as Record<string, unknown>) : {};
}
function id(v: unknown, label: string): string {
  if (typeof v !== "string" || !/^[\w:.-]{1,120}$/.test(v)) throw new Error(`Unknown ${label}.`);
  return v;
}

/** Public: does this listing offer trial nights, and at what price. Hidden while the flag is off. */
export const getListingTrial = createServerFn({ method: "GET" })
  .validator((i: unknown) => id(i, "listing"))
  .handler(async ({ data }) => {
    if (!trialNightsEnabled()) return { available: false as const };
    const t = await listingTrial(await getSql(), data);
    if (!t?.enabled) return { available: false as const };
    return { available: true as const, nightlyInr: t.nightlyInr, maxNights: TRIAL_MAX_NIGHTS, fee: trialFeeBreakdown(), checklist: [...TRIAL_ARRIVAL_CHECKLIST] };
  });

/** Owner: switch trial nights on/off with a nightly price. Saving works even while the flag is off. */
export const saveListingTrial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => {
    const r = rec(i);
    return { listingId: id(r.listingId, "listing"), enabled: r.enabled === true, nightlyInr: r.nightlyInr };
  })
  .handler(async ({ context, data }) => setListingTrial(await getSql(), { ...data, ownerId: context.userId }));

/** Student: book 1-3 nights and get the ₹99 UPI checkout. Confirmed once an admin approves it. */
export const startTrialBooking = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => {
    const r = rec(i);
    return { listingId: id(r.listingId, "listing"), checkIn: r.checkIn, nights: r.nights };
  })
  .handler(async ({ context, data }) => {
    if (!trialNightsEnabled()) throw new Error("Trial nights aren't open yet.");
    const payee = upiPayee();
    if (!payee.ready) throw new Error("UPI payments are not set up yet.");
    const b = await bookTrial(await getSql(), { ...data, seekerId: context.userId, ref: makeRef() });
    const link = buildUpiLink({ vpa: payee.vpa, name: payee.name, amountInr: b.feeInr, ref: b.paymentRef });
    const qr = await QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M" });
    return { ...b, payee: payee.name, vpa: payee.vpa, link, qr, fee: trialFeeBreakdown() };
  });

export const confirmTrialIdChecked = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => id(rec(i).bookingId, "booking"))
  .handler(async ({ context, data }) => markTrialIdChecked(await getSql(), { bookingId: data, ownerId: context.userId }));

/** Owner: current trial settings for their listing (edit page). */
export const getOwnerListingTrial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => id(rec(i).listingId, "listing"))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const r = (await sql.query<{ owner_id: string; trial_nights_enabled: boolean; trial_nightly_inr: number | null }>(
      `select owner_id, trial_nights_enabled, trial_nightly_inr from listings where id = $1`, [data]))[0];
    if (!r || r.owner_id !== context.userId) return null;
    return { enabled: Boolean(r.trial_nights_enabled), nightlyInr: Number(r.trial_nightly_inr ?? 0), live: trialNightsEnabled(), fee: trialFeeBreakdown() };
  });
