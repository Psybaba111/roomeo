import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isMissingTable } from "@/lib/roomsetu/referrals";
import { pdfBase64 } from "@/lib/roomsetu/pdf";
import { CATEGORIES, complaintsEnabled, isMonth, receiptLines, type Category, type Status } from "@/lib/roomsetu/complaints";
import * as db from "@/lib/roomsetu/complaints-db";

const OFF = { enabled: false as const };
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const id = (v: unknown) => {
  if (typeof v !== "string" || !/^[0-9a-zA-Z:-]{4,90}$/.test(v)) throw new Error("Not found.");
  return v;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function assertOn() {
  if (!complaintsEnabled()) throw new Error("Complaints & receipts aren't live yet.");
}
function photo(v: unknown): string | null {
  if (v == null || v === "") return null;
  const m = typeof v === "string" ? /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(v) : null;
  if (!m || m[1].length > 550_000) throw new Error("Use a JPG or PNG photo under ~400 KB.");
  return m[1];
}

export const getComplaintsAndReceipts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!complaintsEnabled()) return OFF;
    try {
      const sql = await getSql();
      return { enabled: true as const, ...(await db.listComplaints(sql, context.userId)), ...(await db.listReceipts(sql, context.userId)) };
    } catch (err) {
      if (isMissingTable(err)) return OFF;
      throw err;
    }
  });

export const raiseComplaint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    const category = text(o.category, 20) as Category;
    if (!(category in CATEGORIES)) throw new Error("Pick what's wrong.");
    const description = text(o.description, 1000);
    if (description.length < 4) throw new Error("Tell the owner a bit more.");
    return { listingId: id(o.listingId), category, description, photo: photo(o.photo) };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    return { id: await db.raiseComplaint(await getSql(), context.userId, data) };
  });

export const updateComplaint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    const to = o.to as Status | "CONFIRM";
    if (!["IN_PROGRESS", "FIXED", "OPEN", "CONFIRM"].includes(to)) throw new Error("Unknown status.");
    const rating = Number(o.rating);
    if (to === "CONFIRM" && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new Error("Rate the fix 1 to 5.");
    return { id: id(o.id), to, note: text(o.note, 300), rating };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    const sql = await getSql();
    if (data.to === "CONFIRM") await db.confirmComplaint(sql, data.id, context.userId, data.rating, data.note);
    else await db.moveComplaint(sql, data.id, context.userId, data.to, data.note);
    return { ok: true };
  });

export const getComplaintPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: id(rec(input).id) }))
  .handler(async ({ context, data }) => {
    assertOn();
    return { dataUrl: await db.complaintPhoto(await getSql(), data.id, context.userId) };
  });

export const markRentPaid = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    if (!isMonth(o.month)) throw new Error("Pick the rent month.");
    const amountInr = Number(o.amountInr);
    if (!Number.isInteger(amountInr) || amountInr < 100 || amountInr > 500_000) throw new Error("Amount should be ₹100 to ₹5,00,000.");
    const paidOn = text(o.paidOn, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new Error("Pick the date it was paid.");
    const method = ["UPI", "BANK", "CASH"].includes(String(o.method)) ? String(o.method) : "UPI";
    return { moveInId: id(o.moveInId), month: o.month, amountInr, paidOn, method, ref: text(o.ref, 40) };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    await db.markRentPaid(await getSql(), context.userId, data);
    return { ok: true };
  });

export const saveReceiptProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    const landlordName = text(o.landlordName, 120);
    if (landlordName.length < 2) throw new Error("Add the landlord name for receipts.");
    return { landlordName, pan: text(o.pan, 12), address: text(o.address, 300) };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    await db.saveReceiptProfile(await getSql(), context.userId, data);
    return { ok: true };
  });

export const getReceiptPdf = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ key: id(rec(input).key) }))
  .handler(async ({ context, data }) => {
    assertOn();
    const r = await db.receiptFor(await getSql(), data.key, context.userId);
    return { filename: `rent-receipt-${r.month}.pdf`, base64: pdfBase64(receiptLines(r)) };
  });
