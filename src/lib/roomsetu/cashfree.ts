/**
 * Cashfree Subscriptions client for UPI AutoPay (API version 2025-01-01).
 * Docs: https://www.cashfree.com/docs/api-reference/payments/previous/v2025-01-01/subscription/mandate/create
 *       https://www.cashfree.com/docs/api-reference/payments/previous/v2025-01-01/subscription/payment/raise
 * Plan type ON_DEMAND = we decide when to charge (controlled / manual trigger), capped by plan_max_amount.
 */
type Env = Record<string, string | undefined>;

export const CASHFREE_API_VERSION = "2025-01-01";

export type CashfreeConfig = { appId: string; secret: string; env: "sandbox" | "production"; baseUrl: string; webhookSecret: string };

/** null unless CASHFREE_APP_ID and CASHFREE_SECRET_KEY are set. CASHFREE_ENV defaults to sandbox. */
export function cashfreeConfig(env: Env = process.env): CashfreeConfig | null {
  const appId = env.CASHFREE_APP_ID?.trim() ?? "";
  const secret = env.CASHFREE_SECRET_KEY?.trim() ?? "";
  if (!appId || !secret) return null;
  const mode = env.CASHFREE_ENV?.trim().toLowerCase() === "production" ? "production" : "sandbox";
  return {
    appId,
    secret,
    env: mode,
    baseUrl: mode === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg",
    // Cashfree signs webhooks with the client secret unless a separate webhook secret is configured.
    webhookSecret: env.CASHFREE_WEBHOOK_SECRET?.trim() || secret,
  };
}

export type CreateSubscriptionInput = {
  subscriptionId: string;
  planName: string;
  maxAmountInr: number;
  customer: { name: string; email: string; phone: string };
  returnUrl: string;
  firstChargeNote?: string;
};

export function createSubscriptionBody(p: CreateSubscriptionInput) {
  return {
    subscription_id: p.subscriptionId,
    customer_details: {
      customer_name: p.customer.name.slice(0, 100),
      customer_email: p.customer.email,
      customer_phone: p.customer.phone.replace(/^\+?91/, "").replace(/\D/g, "").slice(-10),
    },
    plan_details: {
      plan_name: p.planName.slice(0, 40),
      plan_type: "ON_DEMAND",
      plan_max_amount: p.maxAmountInr,
      plan_currency: "INR",
      plan_note: "Monthly PG rent",
    },
    authorization_details: {
      authorization_amount: 1,
      authorization_amount_refund: true,
      payment_methods: ["upi"],
    },
    subscription_meta: { return_url: p.returnUrl },
    subscription_tags: { psp_note: p.firstChargeNote ?? "roomeo rent" },
  };
}

export type RaiseChargeInput = { subscriptionId: string; paymentId: string; amountInr: number; scheduleDate: string; remarks: string };

export function raiseChargeBody(p: RaiseChargeInput) {
  return {
    subscription_id: p.subscriptionId,
    payment_id: p.paymentId,
    payment_type: "CHARGE",
    payment_amount: p.amountInr,
    // Only the date part is used by Cashfree; IST.
    payment_schedule_date: `${p.scheduleDate}T00:00:00+05:30`,
    payment_remarks: p.remarks.slice(0, 40),
  };
}

export class CashfreeError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function cashfreeClient(cfg: CashfreeConfig, fetcher: typeof fetch = fetch) {
  async function call<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = {
      "x-client-id": cfg.appId,
      "x-client-secret": cfg.secret,
      "x-api-version": CASHFREE_API_VERSION,
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["x-idempotency-key"] = idempotencyKey;
    const res = await fetcher(`${cfg.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) throw new CashfreeError(String(json?.message ?? `Cashfree ${res.status}`), res.status, json?.code as string | undefined);
    return json as T;
  }
  return {
    /** POST /subscriptions. The renter authorises with subscription_session_id in Cashfree's checkout. */
    async createSubscription(p: CreateSubscriptionInput) {
      const r = await call<{ cf_subscription_id?: string | number; subscription_session_id?: string; subscription_status?: string }>(
        "POST",
        "/subscriptions",
        createSubscriptionBody(p),
        p.subscriptionId,
      );
      if (!r.subscription_session_id) throw new CashfreeError("Cashfree did not return a session.", 502);
      return { cfSubscriptionId: r.cf_subscription_id != null ? String(r.cf_subscription_id) : null, sessionId: r.subscription_session_id, status: r.subscription_status ?? "INITIALIZED" };
    },
    /** POST /subscriptions/pay with payment_type CHARGE. Cashfree sends the pre-debit notice, then debits on the schedule date. */
    async raiseCharge(p: RaiseChargeInput) {
      const r = await call<{ cf_payment_id?: string | number; payment_status?: string }>("POST", "/subscriptions/pay", raiseChargeBody(p), p.paymentId);
      return { cfPaymentId: r.cf_payment_id != null ? String(r.cf_payment_id) : null, status: r.payment_status ?? "INITIALIZED" };
    },
    async getSubscription(subscriptionId: string) {
      return call<{ subscription_status?: string; cf_subscription_id?: string | number }>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    },
  };
}

/** Cashfree JS SDK script for the subscription checkout (redirect to the UPI app / authorise page). */
export const CASHFREE_SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";
