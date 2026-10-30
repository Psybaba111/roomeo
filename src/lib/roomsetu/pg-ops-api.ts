import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isMissingTable } from "@/lib/roomsetu/referrals";
import { addDays, istDate, MEALS, parseBed, pgOpsEnabled, type Meal } from "@/lib/roomsetu/pg-ops";
import * as db from "@/lib/roomsetu/pg-ops-db";

const OFF = { enabled: false as const };
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const id = (v: unknown) => {
  if (typeof v !== "string" || !/^[0-9a-zA-Z-]{2,80}$/.test(v)) throw new Error("Not found.");
  return v;
};
const date = (v: unknown) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Pick a date.");
  return v;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function assertOn() {
  if (!pgOpsEnabled()) throw new Error("PG tools aren't live yet.");
}

/** Everything for the dashboard: owner board + today's headcount, resident meals + notices. */
export const getPgOps = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!pgOpsEnabled()) return OFF;
    try {
      const sql = await getSql();
      const now = new Date();
      const today = istDate(now);
      const board = await db.bedBoard(sql, context.userId);
      const headcounts = [];
      for (const l of board.listings.slice(0, 10)) headcounts.push({ listingId: l.id, title: l.title, ...(await db.ownerHeadcount(sql, context.userId, l.id, today)) });
      const notices = await db.noticesFor(sql, context.userId);
      const skips = notices.residencies.length ? await db.mySkips(sql, context.userId, today) : [];
      return {
        enabled: true as const,
        today,
        days: [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(today, n)),
        nowMs: now.getTime(),
        board,
        headcounts,
        notices,
        skips: skips.map((s) => `${s.meal_date}|${s.meal}`),
      };
    } catch (err) {
      if (isMissingTable(err)) return OFF;
      throw err;
    }
  });

export const saveBed = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    return { listingId: id(o.listingId), bedId: o.bedId ? id(o.bedId) : null, bed: parseBed(o), tenantUserId: o.tenantUserId ? id(o.tenantUserId) : null };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    return { id: await db.saveBed(await getSql(), context.userId, data.listingId, data.bedId, data.bed, data.tenantUserId) };
  });

export const deleteBed = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: id(rec(input).id) }))
  .handler(async ({ context, data }) => {
    assertOn();
    await db.deleteBed(await getSql(), context.userId, data.id);
    return { ok: true };
  });

export const relistBed = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: id(rec(input).id) }))
  .handler(async ({ context, data }) => {
    assertOn();
    return db.relistBed(await getSql(), context.userId, data.id, new Date());
  });

export const setMealSkip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    if (!MEALS.includes(o.meal as Meal)) throw new Error("Lunch or dinner?");
    return { listingId: id(o.listingId), date: date(o.date), meal: o.meal as Meal, skip: o.skip === true };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    await db.setMealSkip(await getSql(), context.userId, data.listingId, data.date, data.meal, data.skip, new Date());
    return { ok: true };
  });

export const getHeadcount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    return { listingId: id(o.listingId), date: date(o.date) };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    return db.ownerHeadcount(await getSql(), context.userId, data.listingId, data.date);
  });

export const postNotice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    const title = text(o.title, 120);
    if (title.length < 3) throw new Error("Give the notice a title.");
    return { listingId: id(o.listingId), title, body: text(o.body, 2000), pinned: o.pinned === true };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    return { id: await db.postNotice(await getSql(), context.userId, data.listingId, data.title, data.body, data.pinned) };
  });

export const noticeAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = rec(input);
    if (o.action !== "read" && o.action !== "delete") throw new Error("Unknown action.");
    return { id: id(o.id), action: o.action };
  })
  .handler(async ({ context, data }) => {
    assertOn();
    const sql = await getSql();
    if (data.action === "read") await db.markNoticeRead(sql, context.userId, data.id);
    else await db.deleteNotice(sql, context.userId, data.id);
    return { ok: true };
  });
