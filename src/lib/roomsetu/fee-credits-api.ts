import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertAdmin, audit } from "@/lib/roomsetu/admin-api";
import { CREDIT_GST_NOTE, feeCreditConfig } from "@/lib/roomsetu/fee-credits";
import * as db from "@/lib/roomsetu/fee-credits-db";

const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Signed-in user: credit balance and their credits (hidden while the programme is off and they hold nothing). */
export const getMyCredits = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const cfg = feeCreditConfig();
    const sql = await getSql();
    if (!(await db.feeCreditsReady(sql))) return { enabled: cfg.enabled, balanceInr: 0, items: [] as db.CreditRow[] };
    const items = await db.listCredits(sql, context.userId);
    return { enabled: cfg.enabled, balanceInr: items.reduce((n, c) => n + (c.status === "issued" ? c.remainingInr : 0), 0), items };
  });

/** Admin: programme status, every credit, recent audit trail. */
export const adminCredits = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const status = await db.programmeStatus(sql);
    if (!status.ready) return { status, gstNote: CREDIT_GST_NOTE, items: [] as db.CreditRow[], events: [] };
    return { status, gstNote: CREDIT_GST_NOTE, items: await db.listCredits(sql), events: await db.recentCreditEvents(sql, 100) };
  });

export const adminIssuePairCredits = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => {
    const o = rec(i);
    return { referrer: text(o.referrer, 120), friend: text(o.friend, 120), note: text(o.note) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const rows = await db.issuePairCredits(sql, context.userId, data);
    await audit(sql, context.userId, "REFERRAL_CREDITS_ISSUED", "referral", rows[0]?.referralId ?? "", `${rows.length} × ₹${rows[0]?.amountInr ?? 0} ${data.note}`.trim());
    return rows;
  });

export const adminVoidCredit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => {
    const o = rec(i);
    const id = text(o.id, 80);
    if (!/^[0-9A-Za-z_-]{6,80}$/.test(id)) throw new Error("Unknown credit.");
    return { id, reason: text(o.reason) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const row = await db.voidCredit(sql, context.userId, data.id, data.reason);
    await audit(sql, context.userId, "REFERRAL_CREDIT_VOIDED", "referral_credit", data.id, data.reason);
    return row;
  });
