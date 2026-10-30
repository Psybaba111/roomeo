import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  cashfreeSignatureValid,
  eventKey,
  inNpciWindow,
  nextDueDate,
  onTimeBadge,
  parseCashfreeEvent,
  planAction,
  rentAutopayEnabled,
  webhookFresh,
} from "./rent-autopay.ts";
import { cashfreeClient, cashfreeConfig, createSubscriptionBody, raiseChargeBody } from "./cashfree.ts";

const ist = (s: string) => new Date(`${s}+05:30`);

test("flag is off by default", () => {
  assert.equal(rentAutopayEnabled({}), false);
  assert.equal(rentAutopayEnabled({ ROOMEO_RENT_AUTOPAY_ENABLED: "false" }), false);
  assert.equal(rentAutopayEnabled({ ROOMEO_RENT_AUTOPAY_ENABLED: " On " }), true);
});

test("NPCI windows: before 10:00, 13:00-17:00, after 21:30 IST", () => {
  assert.equal(inNpciWindow(ist("2026-11-05T08:30:00")), true);
  assert.equal(inNpciWindow(ist("2026-11-05T10:00:00")), false);
  assert.equal(inNpciWindow(ist("2026-11-05T12:59:00")), false);
  assert.equal(inNpciWindow(ist("2026-11-05T13:00:00")), true);
  assert.equal(inNpciWindow(ist("2026-11-05T17:00:00")), false);
  assert.equal(inNpciWindow(ist("2026-11-05T21:29:00")), false);
  assert.equal(inNpciWindow(ist("2026-11-05T21:30:00")), true);
});

test("next due date rolls into next month and year", () => {
  assert.equal(nextDueDate("2026-11-03", 5), "2026-11-05");
  assert.equal(nextDueDate("2026-11-05", 5), "2026-11-05");
  assert.equal(nextDueDate("2026-12-06", 5), "2027-01-05");
  assert.throws(() => nextDueDate("2026-11-01", 31));
});

const fresh = { status: "PENDING" as const, attempts: 0, notified: true, chargeRequested: false, fallbackSent: false };

test("scheduler: notify ≥24h ahead, charge only in NPCI window, one retry, then UPI fallback", () => {
  // 2 days before due: notify.
  assert.deepEqual(planAction({ now: ist("2026-11-03T08:30:00"), dueDay: 5, mandateActive: true, entry: null }), { kind: "notify", dueDate: "2026-11-05" });
  // Due today with no notice yet: too late, never debit without 24h notice.
  assert.equal(planAction({ now: ist("2026-11-05T08:30:00"), dueDay: 5, mandateActive: true, entry: null }).kind, "none");
  // Notified, in window: charge scheduled for the due date.
  assert.deepEqual(planAction({ now: ist("2026-11-04T08:30:00"), dueDay: 5, mandateActive: true, entry: fresh, entryDueDate: "2026-11-05" }), {
    kind: "charge", dueDate: "2026-11-05", scheduleDate: "2026-11-05", attempt: 1,
  });
  // Outside window: wait.
  assert.equal(planAction({ now: ist("2026-11-04T11:00:00"), dueDay: 5, mandateActive: true, entry: fresh, entryDueDate: "2026-11-05" }).kind, "none");
  // Failed once: retry tomorrow.
  const failed1 = { ...fresh, status: "FAILED" as const, attempts: 1, chargeRequested: true };
  assert.deepEqual(planAction({ now: ist("2026-11-05T21:45:00"), dueDay: 5, mandateActive: true, entry: failed1, entryDueDate: "2026-11-05" }), {
    kind: "charge", dueDate: "2026-11-05", scheduleDate: "2026-11-06", attempt: 2,
  });
  // Failed twice: fallback link.
  assert.equal(planAction({ now: ist("2026-11-07T08:30:00"), dueDay: 5, mandateActive: true, entry: { ...failed1, attempts: 2 }, entryDueDate: "2026-11-05" }).kind, "fallback");
  // Paid: nothing.
  assert.equal(planAction({ now: ist("2026-11-07T08:30:00"), dueDay: 5, mandateActive: true, entry: { ...fresh, status: "PAID" }, entryDueDate: "2026-11-05" }).kind, "none");
  // No mandate: no notice/charge, fallback once overdue.
  assert.equal(planAction({ now: ist("2026-11-03T08:30:00"), dueDay: 5, mandateActive: false, entry: null }).kind, "none");
});

test("badge counts provider-confirmed entries only, last 3 months", () => {
  const now = ist("2026-11-20T09:00:00");
  const rows = [
    { month: "2026-09", dueDate: "2026-09-05", paidAt: "2026-09-05 03:00:00+00", status: "PAID", providerConfirmed: true },
    { month: "2026-10", dueDate: "2026-10-05", paidAt: "2026-10-07 03:00:00+00", status: "PAID", providerConfirmed: true },
    { month: "2026-11", dueDate: "2026-11-05", paidAt: "2026-11-05 03:00:00+00", status: "PAID", providerConfirmed: true },
    { month: "2026-11", dueDate: "2026-11-05", paidAt: "2026-11-01 03:00:00+00", status: "PAID", providerConfirmed: false },
    { month: "2026-06", dueDate: "2026-06-05", paidAt: "2026-06-09 03:00:00+00", status: "PAID", providerConfirmed: true },
  ];
  assert.deepEqual(onTimeBadge(rows, now), { percent: 67, months: 3 });
  assert.equal(onTimeBadge(rows.filter((r) => !r.providerConfirmed), now), null);
});

test("Cashfree signature: base64 HMAC-SHA256 of timestamp + raw body", () => {
  const raw = '{"type":"SUBSCRIPTION_PAYMENT_SUCCESS"}';
  const ts = "1761800000";
  const sig = createHmac("sha256", "s3cret").update(ts + raw).digest("base64");
  assert.equal(cashfreeSignatureValid("s3cret", ts, raw, sig), true);
  assert.equal(cashfreeSignatureValid("s3cret", ts, raw + " ", sig), false);
  assert.equal(cashfreeSignatureValid("other", ts, raw, sig), false);
  assert.equal(cashfreeSignatureValid("s3cret", null, raw, sig), false);
  assert.equal(webhookFresh(String(Math.floor(Date.now() / 1000)), new Date()), true);
  assert.equal(webhookFresh("1000", new Date()), false);
});

test("parses Cashfree subscription events", () => {
  const status = parseCashfreeEvent({
    type: "SUBSCRIPTION_STATUS_CHANGED",
    data: { subscription_details: { cf_subscription_id: "23639356", subscription_id: "rm_rent_x_1", subscription_status: "ACTIVE" } },
  });
  assert.deepEqual(status, { kind: "mandate", subscriptionId: "rm_rent_x_1", cfSubscriptionId: "23639356", status: "ACTIVE" });
  const pay = parseCashfreeEvent({
    type: "SUBSCRIPTION_PAYMENT_SUCCESS",
    event_time: "2026-11-05T10:00:00+05:30",
    data: { subscription_id: "rm_rent_x_1", payment_id: "rm_rp_x_202611_1", cf_payment_id: 991, payment_amount: 8999, payment_type: "CHARGE" },
  });
  assert.equal(pay.kind, "payment");
  assert.equal(pay.kind === "payment" && pay.status, "PAID");
  assert.equal(eventKey("SUBSCRIPTION_PAYMENT_SUCCESS", "1", "x", pay), "SUBSCRIPTION_PAYMENT_SUCCESS:rm_rp_x_202611_1");
  assert.equal(parseCashfreeEvent({ type: "SUBSCRIPTION_PAYMENT_SUCCESS", data: { subscription_id: "a", payment_id: "b", payment_type: "AUTH" } }).kind, "ignored");
  assert.equal(parseCashfreeEvent({ type: "WHATEVER" }).kind, "ignored");
  assert.equal(parseCashfreeEvent(null).kind, "ignored");
});

test("Cashfree client: config, request shapes and headers (mocked fetch)", async () => {
  assert.equal(cashfreeConfig({}), null);
  const cfg = cashfreeConfig({ CASHFREE_APP_ID: "app", CASHFREE_SECRET_KEY: "sec" })!;
  assert.equal(cfg.baseUrl, "https://sandbox.cashfree.com/pg");
  assert.equal(cfg.webhookSecret, "sec");
  assert.equal(cashfreeConfig({ CASHFREE_APP_ID: "a", CASHFREE_SECRET_KEY: "b", CASHFREE_ENV: "production" })!.baseUrl, "https://api.cashfree.com/pg");

  const body = createSubscriptionBody({ subscriptionId: "s1", planName: "Rent", maxAmountInr: 8999, customer: { name: "A", email: "a@b.c", phone: "+919876543210" }, returnUrl: "https://x/d" });
  assert.equal(body.plan_details.plan_type, "ON_DEMAND");
  assert.equal(body.customer_details.customer_phone, "9876543210");
  assert.deepEqual(body.authorization_details.payment_methods, ["upi"]);
  assert.equal(raiseChargeBody({ subscriptionId: "s1", paymentId: "p1", amountInr: 8999, scheduleDate: "2026-11-05", remarks: "r" }).payment_schedule_date, "2026-11-05T00:00:00+05:30");

  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const json = url.endsWith("/subscriptions") ? { cf_subscription_id: 7, subscription_session_id: "sess", subscription_status: "INITIALIZED" } : { cf_payment_id: 9, payment_status: "INITIALIZED" };
    return new Response(JSON.stringify(json), { status: 200 });
  }) as unknown as typeof fetch;
  const c = cashfreeClient(cfg, fake);
  assert.deepEqual(await c.createSubscription({ subscriptionId: "s1", planName: "Rent", maxAmountInr: 1, customer: { name: "A", email: "a@b.c", phone: "9876543210" }, returnUrl: "https://x" }), { cfSubscriptionId: "7", sessionId: "sess", status: "INITIALIZED" });
  assert.deepEqual(await c.raiseCharge({ subscriptionId: "s1", paymentId: "p1", amountInr: 1, scheduleDate: "2026-11-05", remarks: "r" }), { cfPaymentId: "9", status: "INITIALIZED" });
  const h = calls[1].init.headers as Record<string, string>;
  assert.equal(calls[1].url, "https://sandbox.cashfree.com/pg/subscriptions/pay");
  assert.equal(h["x-api-version"], "2025-01-01");
  assert.equal(h["x-idempotency-key"], "p1");
  const bad = cashfreeClient(cfg, (async () => new Response(JSON.stringify({ message: "nope" }), { status: 400 })) as unknown as typeof fetch);
  await assert.rejects(bad.raiseCharge({ subscriptionId: "s", paymentId: "p", amountInr: 1, scheduleDate: "2026-11-05", remarks: "" }), /nope/);
});
