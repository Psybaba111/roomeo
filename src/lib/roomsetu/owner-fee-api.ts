import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { pricingConfig } from "@/lib/roomsetu/pricing";
import { assertAdmin, audit } from "@/lib/roomsetu/admin-api";
import { OWNER_FEE_OFF, ownerFeeGstPct, ownerFeeState, ownerFeeView, type CommissionStatus } from "@/lib/roomsetu/owner-fee";
import * as db from "@/lib/roomsetu/owner-fee-db";

const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const id = (v: unknown, what = "commission") => {
  if (typeof v !== "string" || !/^[0-9A-Za-z_-]{6,80}$/.test(v)) throw new Error(`Unknown ${what}.`);
  return v;
};
const ymd = (v: unknown, label: string) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`Pick the ${label}.`);
  return v;
};
const ref = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");

function state() {
  const cfg = pricingConfig();
  const s = ownerFeeState(cfg.successFeeEnabled);
  const gstPct = ownerFeeGstPct();
  return { ...s, gstPct, tenantFeeOn: cfg.successFeeEnabled, tenantFeeSource: cfg.tenantFeeSource, view: s.active ? ownerFeeView(true, gstPct) : OWNER_FEE_OFF };
}

/** Owner: my commissions (works even with the switch off, so past rows stay visible). */
export const getMyCommissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const st = state();
    try {
      const sql = await getSql();
      return { active: st.active, view: st.view, items: await db.ownerCommissions(sql, context.userId) };
    } catch (err) {
      if (db.isMissingCommissionTable(err)) return { active: false, view: OWNER_FEE_OFF, items: [] };
      throw err;
    }
  });

/** Admin: every commission, plus founding hosts and the switch state. */
export const adminCommissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((i: unknown) => {
    const s = rec(i).status;
    return { status: s === "due" || s === "due_50" || s === "paid" || s === "refunded_50" ? (s as CommissionStatus) : undefined };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const st = state();
    try {
      return { state: st, migrated: true, items: await db.allCommissions(sql, data.status), founding: await db.foundingHosts(sql) };
    } catch (err) {
      if (db.isMissingCommissionTable(err)) return { state: st, migrated: false, items: [], founding: [] };
      throw err;
    }
  });

export const adminMarkCommissionPaid = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => {
    const o = rec(i);
    return { id: id(o.id), paidOn: ymd(o.paidOn, "paid date"), ref: ref(o.ref) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const row = await db.markCommissionPaid(sql, data.id, context.userId, data.paidOn, data.ref);
    await audit(sql, context.userId, "COMMISSION_PAID", "owner_commission", data.id, `₹${row.paidInr ?? row.amountDueInr} paid ${data.paidOn} ${data.ref}`.trim());
    return row;
  });

/** Admin: tenant left within 15 days before the owner paid → the owner owes 50% (status due_50). */
export const adminRecordEarlyExit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => {
    const o = rec(i);
    return { id: id(o.id), vacatedOn: ymd(o.vacatedOn, "move-out date") };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const row = await db.recordEarlyExit(sql, data.id, context.userId, data.vacatedOn);
    await audit(sql, context.userId, "COMMISSION_EARLY_EXIT_50", "owner_commission", data.id, `moved out ${data.vacatedOn}; ₹${row.amountDueInr} now due`);
    return row;
  });

export const adminRecordCommissionRefund = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => {
    const o = rec(i);
    return { id: id(o.id), vacatedOn: ymd(o.vacatedOn, "move-out date"), refundedOn: ymd(o.refundedOn, "refund date"), ref: ref(o.ref) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const row = await db.recordCommissionRefund(sql, data.id, context.userId, data);
    await audit(sql, context.userId, "COMMISSION_REFUND_50", "owner_commission", data.id, `₹${row.refundInr} refunded ${data.refundedOn}; moved out ${data.vacatedOn} ${data.ref}`.trim());
    return row;
  });

/** Admin: set a host as founding partner (15% until the end date) or clear it. Never automated. */
export const adminSetFoundingPartner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => {
    const o = rec(i);
    return { ownerId: id(o.ownerId, "host"), on: o.on === true, until: o.until == null || o.until === "" ? null : ymd(o.until, "end date"), note: ref(o.note) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const host = (await sql<{ user_id: string }>`select user_id from profiles where user_id = ${data.ownerId}`)[0];
    if (!host) throw new Error("No such host.");
    const r = await db.setFoundingPartner(sql, data.ownerId, context.userId, data);
    await audit(sql, context.userId, data.on ? "FOUNDING_PARTNER_SET" : "FOUNDING_PARTNER_CLEARED", "profile", data.ownerId, r.foundingUntil ? `until ${r.foundingUntil}` : "");
    return r;
  });
