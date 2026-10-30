import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { SITE_URL } from "@/lib/seo";
import { isMissingTable } from "@/lib/roomsetu/referrals";
import { pdfBase64 } from "@/lib/roomsetu/pdf";
import { moveInEnabled, parseDetails, parseIdImage } from "@/lib/roomsetu/movein";
import * as db from "@/lib/roomsetu/movein-db";

const OFF = { enabled: false as const };
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const uuid = (v: unknown) => {
  if (typeof v !== "string" || !/^[0-9a-zA-Z-]{8,80}$/.test(v)) throw new Error("Not found.");
  return v;
};
const token = (v: unknown) => {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{16,40}$/.test(v)) throw new Error("This move-in link looks off.");
  return v;
};
const date = (v: unknown, label: string) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`Pick the ${label}.`);
  return v;
};
const money = (v: unknown, label: string, min = 0) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > 500_000) throw new Error(`${label} should be a whole rupee amount.`);
  return n;
};
const optMoney = (v: unknown, label: string) => (v == null || v === "" ? null : money(v, label, 100));
function assertOn() {
  if (!moveInEnabled()) throw new Error("Digital move-in isn't live yet.");
}
const photo = (v: unknown) => (v == null || v === "" ? null : parseIdImage(v).base64);

export const getMoveIns = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!moveInEnabled()) return OFF;
    try {
      const sql = await getSql();
      const items = await db.listMoveIns(sql, context.userId);
      const listings = await sql<{ id: string; title: string; monthly_rent: number; deposit: number }>`
        select id, title, monthly_rent, deposit from listings where owner_id = ${context.userId} and status <> 'REMOVED' order by created_at desc limit 30`;
      return {
        enabled: true as const,
        base: `${SITE_URL}/move-in/`,
        items,
        listings: listings.map((l) => ({ ...l, monthly_rent: Number(l.monthly_rent), deposit: Number(l.deposit) })),
      };
    } catch (err) {
      if (isMissingTable(err)) return OFF;
      throw err;
    }
  });

export const createMoveInInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    return {
      listingId: uuid(o.listingId),
      bedLabel: typeof o.bedLabel === "string" ? o.bedLabel.trim().slice(0, 40) : "",
      rentInr: optMoney(o.rentInr, "Rent"),
      depositInr: o.depositInr == null || o.depositInr === "" ? null : money(o.depositInr, "Deposit"),
      startDate: date(o.startDate, "move-in date"),
      houseRules: typeof o.houseRules === "string" ? o.houseRules.trim().slice(0, 4000) : "",
    };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    const r = await db.createInvite(await getSql(), context.userId, data);
    return { ...r, link: `${SITE_URL}/move-in/${r.token}` };
  });

export const openMoveIn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ token: token(rec(input).token) }))
  .handler(async ({ context, data }) => {
    if (!moveInEnabled()) return OFF;
    const sql = await getSql();
    const { role, inv } = await db.openInvite(sql, data.token, context.userId);
    const doc = await db.agreementDoc(sql, inv.id, context.userId);
    const mine = (await db.listMoveIns(sql, context.userId)).find((m) => m.id === inv.id);
    return { enabled: true as const, role, id: inv.id, status: inv.status, title: inv.title, bedLabel: inv.bed_label, rentInr: Number(inv.rent_inr), depositInr: Number(inv.deposit_inr), startDate: inv.start_date, ownerName: inv.owner_name, agreement: doc.text, signature: doc.signature ? { name: doc.signature.typed_name, at: doc.signature.signed_at } : null, tenantName: mine?.tenantName ?? null };
  });

export const submitMoveInDetails = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    return { id: uuid(o.id), details: parseDetails(o), image: parseIdImage(o.idImage) };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    const r = await db.submitDetails(await getSql(), data.id, context.userId, data.details, data.image);
    return { ok: true, ...r };
  });

export const signMoveInAgreement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    if (o.agree !== true) throw new Error("Tick the box to agree first.");
    return { id: uuid(o.id), typedName: typeof o.typedName === "string" ? o.typedName.slice(0, 80) : "" };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    const { requestMeta } = await import("@/lib/roomsetu/request-meta.server");
    return db.signAgreement(await getSql(), data.id, context.userId, data.typedName, requestMeta());
  });

/** The ID photo, for the owner or the resident only. Returned inline, never as a public URL. */
export const getMoveInIdPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: uuid(rec(input).id) }))
  .handler(async ({ context, data }) => {
    assertOn();
    return { dataUrl: await db.idDoc(await getSql(), data.id, context.userId) };
  });

export const getAgreementPdf = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: uuid(rec(input).id) }))
  .handler(async ({ context, data }) => {
    assertOn();
    const doc = await db.agreementDoc(await getSql(), data.id, context.userId);
    const [title, ...rest] = doc.text;
    const sig = doc.signature
      ? [`Signed electronically by ${doc.signature.typed_name} on ${doc.signature.signed_at} from IP ${doc.signature.ip || "unknown"}.`, `Document fingerprint (SHA-256): ${doc.signature.agreement_sha256}`]
      : ["Not signed yet."];
    return {
      filename: "roomeo-stay-agreement.pdf",
      base64: pdfBase64([{ text: title, size: 13, bold: true }, ...rest.map((t) => ({ text: t, bold: t === "HOUSE RULES", gap: 6 })), { text: "SIGNATURES", bold: true, gap: 14 }, ...sig.map((t) => ({ text: t, size: 9 })), { text: "Licensor: ____________________", gap: 20 }]),
    };
  });

export const getPoliceFormPdf = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: uuid(rec(input).id) }))
  .handler(async ({ context, data }) => {
    assertOn();
    return { filename: "mangaluru-police-tenant-form.pdf", base64: pdfBase64(await db.policeForm(await getSql(), data.id, context.userId)) };
  });

export const recordMoveInDeposit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    return { id: uuid(o.id), amountInr: money(o.amountInr, "Deposit"), receivedOn: date(o.receivedOn, "date received") };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    await db.recordDeposit(await getSql(), data.id, context.userId, data.amountInr, data.receivedOn);
    return { ok: true };
  });

export const addDepositDeduction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 300) : "";
    if (reason.length < 3) throw new Error("Say what the deduction is for.");
    return { depositId: uuid(o.depositId), amountInr: money(o.amountInr, "Deduction", 1), reason, photo: photo(o.photo) };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    await db.addDeduction(await getSql(), data.depositId, context.userId, data.amountInr, data.reason, data.photo);
    return { ok: true };
  });

export const getDeductionPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: uuid(rec(input).id) }))
  .handler(async ({ context, data }) => {
    assertOn();
    return { dataUrl: await db.deductionPhoto(await getSql(), data.id, context.userId) };
  });

export const depositAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    const action = o.action;
    if (action !== "ack" && action !== "checkout" && action !== "refund") throw new Error("Unknown action.");
    return {
      depositId: uuid(o.depositId),
      action,
      date: action === "ack" ? "" : date(o.date, action === "checkout" ? "checkout date" : "refund date"),
      amountInr: action === "refund" ? money(o.amountInr, "Refund") : 0,
      ref: typeof o.ref === "string" ? o.ref.trim().slice(0, 60) : "",
    };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    const sql = await getSql();
    if (data.action === "ack") await db.ackDeposit(sql, data.depositId, context.userId);
    else if (data.action === "checkout") await db.setCheckout(sql, data.depositId, context.userId, data.date);
    else await db.markRefunded(sql, data.depositId, context.userId, data.amountInr, data.date, data.ref);
    return { ok: true };
  });
