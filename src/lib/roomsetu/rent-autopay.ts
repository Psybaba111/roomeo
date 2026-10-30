/** Rent AutoPay: pure rules (flag, NPCI windows, schedule, badge, webhook parsing). DB work lives in rent-autopay-api.ts. */
import { createHmac, timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;
const procEnv = (): Env => (typeof process !== "undefined" ? (process.env as Env) : {});

/** OFF unless ROOMEO_RENT_AUTOPAY_ENABLED is true/1/on/yes. Needs migration 0018 on the database first. */
export function rentAutopayEnabled(env: Env = procEnv()): boolean {
  const v = env.ROOMEO_RENT_AUTOPAY_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

/** UPI AutoPay without per-debit PIN works up to ₹15,000 (NPCI). Above that the renter approves each month. */
export const UPI_AUTOPAY_NO_PIN_LIMIT_INR = 15_000;
/** One retry after a failed debit, then the renter gets a plain UPI link. */
export const MAX_DEBIT_ATTEMPTS = 2;
/** Pre-debit notice goes out this many days before the due date (NPCI wants at least 24h). */
export const NOTIFY_LEAD_DAYS = 2;

const IST_OFFSET_MIN = 330;

/** Wall-clock parts in IST for an instant. */
export function istParts(now: Date) {
  const t = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    minutes: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}

/**
 * NPCI non-peak windows for AutoPay execution: before 10:00, 13:00–17:00, and after 21:30 IST.
 * Debits are only triggered inside these.
 */
export function inNpciWindow(now: Date): boolean {
  const { minutes } = istParts(now);
  return minutes < 10 * 60 || (minutes >= 13 * 60 && minutes < 17 * 60) || minutes >= 21 * 60 + 30;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Today's date in IST as YYYY-MM-DD. */
export function istToday(now: Date): string {
  const p = istParts(now);
  return ymd(p.y, p.m, p.d);
}

export function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Next due date on or after `today` for a plan's due day (1–28, so every month has it). */
export function nextDueDate(today: string, dueDay: number): string {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) throw new Error("Due day must be 1 to 28.");
  const [y, m, d] = today.split("-").map(Number);
  if (d <= dueDay) return ymd(y, m, dueDay);
  return m === 12 ? ymd(y + 1, 1, dueDay) : ymd(y, m + 1, dueDay);
}

export const monthOf = (date: string) => date.slice(0, 7);

export type EntryState = {
  status: "PENDING" | "PAID" | "FAILED";
  attempts: number;
  notified: boolean;
  chargeRequested: boolean;
  fallbackSent: boolean;
};

export type SchedulerAction =
  | { kind: "none"; reason: string }
  | { kind: "notify"; dueDate: string }
  | { kind: "charge"; dueDate: string; scheduleDate: string; attempt: number }
  | { kind: "fallback"; dueDate: string };

/**
 * What the daily run should do for one plan. Order: notify (≥24h before due) → charge with
 * payment_schedule_date = due date (only inside an NPCI window) → on failure one retry → UPI link fallback.
 */
export function planAction(p: {
  now: Date;
  dueDay: number;
  mandateActive: boolean;
  entry: EntryState | null;
  /** Due date of the open entry, if one exists for an earlier month still being chased. */
  entryDueDate?: string;
}): SchedulerAction {
  const today = istToday(p.now);
  const dueDate = p.entryDueDate ?? nextDueDate(today, p.dueDay);
  const e = p.entry;
  if (e?.status === "PAID") return { kind: "none", reason: "paid" };
  if (e?.fallbackSent) return { kind: "none", reason: "fallback already sent" };
  if (!p.mandateActive) {
    if (e && today >= dueDate) return { kind: "fallback", dueDate };
    return { kind: "none", reason: "no active mandate" };
  }
  const daysToDue = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (!e || !e.notified) {
    if (daysToDue >= 1 && daysToDue <= NOTIFY_LEAD_DAYS) return { kind: "notify", dueDate };
    if (daysToDue < 1 && !e) return { kind: "none", reason: "too late to notify this cycle" };
    if (!e) return { kind: "none", reason: "not yet" };
  }
  if (!inNpciWindow(p.now)) return { kind: "none", reason: "outside NPCI window" };
  // Raise the charge the day before due (after the notice day), scheduled for the due date itself.
  if (e && !e.chargeRequested && e.status === "PENDING" && daysToDue > 1) return { kind: "none", reason: "notice period" };
  if (e && !e.chargeRequested && e.status === "PENDING") return { kind: "charge", dueDate, scheduleDate: dueDate, attempt: 1 };
  if (e && e.status === "FAILED") {
    if (e.attempts < MAX_DEBIT_ATTEMPTS) {
      // A retry needs its own fresh 24h notice, so it lands tomorrow at the earliest.
      const next = addDays(today, 1);
      return { kind: "charge", dueDate, scheduleDate: next > dueDate ? next : dueDate, attempt: e.attempts + 1 };
    }
    return { kind: "fallback", dueDate };
  }
  return { kind: "none", reason: "waiting for the bank" };
}

/** "Rent paid on time" badge: share of provider-confirmed months paid on or before the due date, last 3 months. */
export function onTimeBadge(
  rows: { month: string; dueDate: string; paidAt: string | null; status: string; providerConfirmed: boolean }[],
  now: Date,
  months = 3,
): { percent: number; months: number } | null {
  const today = istToday(now);
  const cutoff = monthOf(addDays(`${today.slice(0, 7)}-01`, -31 * (months - 1)));
  const counted = rows.filter((r) => r.providerConfirmed && r.month >= cutoff && r.dueDate <= today);
  if (!counted.length) return null;
  const onTime = counted.filter((r) => r.status === "PAID" && r.paidAt && r.paidAt.slice(0, 10) <= r.dueDate).length;
  return { percent: Math.round((onTime / counted.length) * 100), months: new Set(counted.map((r) => r.month)).size };
}

/** Cashfree webhook check: Base64(HMAC-SHA256(timestamp + rawBody, secret)), constant-time compare. */
export function cashfreeSignatureValid(secret: string, timestamp: string | null, rawBody: string, signature: string | null): boolean {
  if (!secret || !timestamp || !signature) return false;
  const expected = createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Reject replays older than this. */
export const WEBHOOK_MAX_AGE_MS = 15 * 60_000;
export function webhookFresh(timestamp: string | null, now: Date): boolean {
  if (!timestamp) return false;
  const n = Number(timestamp);
  const ms = Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(timestamp);
  return Number.isFinite(ms) && Math.abs(now.getTime() - ms) <= WEBHOOK_MAX_AGE_MS;
}

export type CashfreeEvent =
  | { kind: "mandate"; subscriptionId: string; cfSubscriptionId: string | null; status: string }
  | { kind: "payment"; subscriptionId: string; paymentId: string; cfPaymentId: string | null; status: "PAID" | "FAILED" | "PENDING"; amount: number | null; at: string | null }
  | { kind: "ignored"; type: string };

const s = (v: unknown) => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

/** Map a Cashfree Subscriptions webhook body to what we store. Unknown events are ignored, never thrown. */
export function parseCashfreeEvent(body: unknown): CashfreeEvent {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const type = s(o.type) ?? "";
  const data = (o.data && typeof o.data === "object" ? o.data : {}) as Record<string, unknown>;
  if (type === "SUBSCRIPTION_STATUS_CHANGED" || type === "SUBSCRIPTION_AUTH_STATUS") {
    const sd = (data.subscription_details ?? {}) as Record<string, unknown>;
    const subscriptionId = s(sd.subscription_id) ?? s(data.subscription_id);
    let status = s(sd.subscription_status);
    if (!status && type === "SUBSCRIPTION_AUTH_STATUS") {
      const ad = (data.authorization_details ?? data) as Record<string, unknown>;
      const auth = s(ad.authorization_status) ?? s(data.payment_status);
      status = auth === "ACTIVE" || auth === "SUCCESS" ? "ACTIVE" : auth === "FAILED" ? "AUTH_FAILED" : null;
    }
    if (!subscriptionId || !status) return { kind: "ignored", type };
    return { kind: "mandate", subscriptionId, cfSubscriptionId: s(sd.cf_subscription_id), status };
  }
  if (type === "SUBSCRIPTION_PAYMENT_SUCCESS" || type === "SUBSCRIPTION_PAYMENT_FAILED" || type === "SUBSCRIPTION_PAYMENT_CANCELLED") {
    const subscriptionId = s(data.subscription_id);
    const paymentId = s(data.payment_id);
    if (!subscriptionId || !paymentId) return { kind: "ignored", type };
    if (s(data.payment_type) === "AUTH") return { kind: "ignored", type };
    const amount = Number(data.payment_amount);
    return {
      kind: "payment",
      subscriptionId,
      paymentId,
      cfPaymentId: s(data.cf_payment_id),
      status: type === "SUBSCRIPTION_PAYMENT_SUCCESS" ? "PAID" : "FAILED",
      amount: Number.isFinite(amount) ? amount : null,
      at: s(data.payment_initiated_date) ?? s(o.event_time),
    };
  }
  return { kind: "ignored", type };
}

/** Stable key for the idempotent event log. */
export function eventKey(type: string, timestamp: string | null, signature: string | null, ev: CashfreeEvent): string {
  if (ev.kind === "payment") return `${type}:${ev.paymentId}`;
  if (ev.kind === "mandate") return `${type}:${ev.subscriptionId}:${ev.status}`;
  return `${type}:${timestamp ?? ""}:${(signature ?? "").slice(0, 32)}`;
}

/** Our own IDs for Cashfree (alphanumeric, _ - . allowed, ≤250 chars). */
export const subscriptionIdFor = (planId: string, n: number) => `rm_rent_${planId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}_${n}`;
export const paymentIdFor = (planId: string, month: string, attempt: number) =>
  `rm_rp_${planId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}_${month.replace("-", "")}_${attempt}`;

/** WhatsApp templates the scheduler queues (MappStore). None are sent live from here. */
export const RENT_TEMPLATES = {
  PRE_DEBIT: "roomeo_rent_predebit", // {{1}} name, {{2}} amount, {{3}} due date
  PAID: "roomeo_rent_paid", // {{1}} name, {{2}} amount, {{3}} month
  FALLBACK: "roomeo_rent_pay_link", // {{1}} name, {{2}} amount, {{3}} pay link
} as const;
