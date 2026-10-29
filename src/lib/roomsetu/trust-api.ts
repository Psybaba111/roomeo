import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { bool, num, str } from "@/lib/roomsetu/map";
import { callbackUrlFrom, digilockerAuthorizeUrl, judgeDigilockerUser, nextIdentityAttempt } from "@/lib/roomsetu/identity";
import { FEE_INR, rentQuote } from "@/lib/roomsetu/money";
import { canPublish, generateOtp, hashOtp, normalizeIndianMobile, OTP_MAX_ATTEMPTS, otpMatches, otpTtlMinutes, otpProviderFromEnv } from "@/lib/roomsetu/otp";
import { hitLimit } from "@/lib/roomsetu/rate-limit";

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function listingKey(v: unknown): string {
  if (typeof v !== "string" || !/^[0-9a-f-]{8,80}$/i.test(v)) throw new Error("Unknown room.");
  return v;
}

function digilockerEnv() {
  const clientId = process.env.DIGILOCKER_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.DIGILOCKER_CLIENT_SECRET?.trim() ?? "";
  const base = (process.env.DIGILOCKER_BASE?.trim() || "https://digilocker.meripehchaan.gov.in/public").replace(/\/$/, "");
  return { ready: Boolean(clientId && clientSecret), clientId, clientSecret, base };
}

/** @deprecated Legacy rent checkout. Disabled unless RAZORPAY_* keys are set; plans use direct UPI (upi.ts). */
function razorpayEnv() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  return { ready: Boolean(keyId && secret), keyId, secret };
}

export async function closeIdentityThreads(sql: Sql, userId: string) {
  const rows = await sql<{ id: string }>`
    select c.id from conversations c
    join conversation_members m on m.conversation_id = c.id and m.user_id = ${userId}
    where c.closed_at is null`;
  const body = "This thread is closed because an identity check failed a second time. Rent cannot be collected.";
  for (const row of rows) {
    await sql`update conversations set closed_at = now(), updated_at = now() where id = ${row.id}`;
    await sql`insert into messages (id, conversation_id, sender_id, body, kind) values (${crypto.randomUUID()}, ${row.id}, ${userId}, ${body}, 'SYSTEM')`;
  }
}

/** One row per (user_id, kind), written in a single statement. A VERIFIED check is never downgraded here. */
export async function upsertCheck(sql: Sql, userId: string, kind: string, status: "VERIFIED" | "REJECTED" | "PENDING", note: string) {
  await sql`insert into trust_checks (id, user_id, kind, status, note) values (${crypto.randomUUID()}, ${userId}, ${kind}, ${status}, ${note})
    on conflict (user_id, kind) do update set status = excluded.status, note = excluded.note, updated_at = now()
    where trust_checks.status <> 'VERIFIED' or excluded.status = 'VERIFIED'`;
}

async function recordIdentity(sql: Sql, userId: string, passed: boolean, person?: { name: string; digilockerId: string; eaadhaar: boolean }) {
  const current = await sql<{ identity_attempts: number }>`select identity_attempts from profiles where user_id = ${userId}`;
  const decision = nextIdentityAttempt(num(current[0]?.identity_attempts), passed);
  if (passed && person) {
    await sql`update profiles set identity_status = 'VERIFIED', identity_source = 'DIGILOCKER', identity_attempts = ${decision.attempts}, digilocker_id = ${person.digilockerId}, updated_at = now() where user_id = ${userId}`;
    const note = person.eaadhaar ? "DigiLocker, with e-Aadhaar shared." : "DigiLocker account. e-Aadhaar was not shared.";
    await upsertCheck(sql, userId, "IDENTITY", "VERIFIED", note);
    return decision;
  }
  await sql`update profiles set identity_status = ${decision.status}, identity_attempts = ${decision.attempts}, updated_at = now() where user_id = ${userId}`;
  await upsertCheck(sql, userId, "IDENTITY", "REJECTED", decision.closeThreads ? "DigiLocker failed a second time." : "DigiLocker failed. One retry remains.");
  if (decision.closeThreads) await closeIdentityThreads(sql, userId);
  return decision;
}

export const getVerification = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await sql<Record<string, unknown>>`select account_status, verification_status, identity_status, identity_source, identity_attempts, phone_e164, phone_verified_at from profiles where user_id = ${context.userId}`;
    const row = profile[0];
    if (!row) throw new Error("Finish your profile to continue.");
    if (str(row.account_status) === "SUSPENDED") throw new Error("This account is suspended.");
    const checks = await sql.query<Record<string, unknown>>(
      `select id, kind, status, note from trust_checks where user_id = $1 order by created_at`,
      [context.userId],
    );
    return {
      status: str(row.verification_status),
      identityStatus: str(row.identity_status) || "UNVERIFIED",
      identitySource: str(row.identity_source),
      attempts: num(row.identity_attempts),
      digilockerReady: digilockerEnv().ready,
      otpReady: otpProviderFromEnv() !== null,
      phone: str(row.phone_e164),
      phoneVerified: Boolean(row.phone_verified_at),
      canPublish: canPublish({ identityStatus: str(row.identity_status), phoneVerified: Boolean(row.phone_verified_at) }),
      feeInr: FEE_INR,
      checks: checks.map((c) => ({ id: str(c.id), kind: str(c.kind), status: str(c.status), note: str(c.note) })),
    };
  });

export const startDigilocker = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const partner = digilockerEnv();
    if (!partner.ready) throw new Error("DigiLocker partner keys are not on this deployment yet.");
    const sql = await getSql();
    const profile = await sql<{ identity_status: string; identity_source: string; identity_attempts: number; account_status: string }>`
      select identity_status, identity_source, identity_attempts, account_status from profiles where user_id = ${context.userId}`;
    const row = profile[0];
    if (!row) throw new Error("Finish your profile to continue.");
    if (row.account_status === "SUSPENDED") throw new Error("This account is suspended.");
    if (row.identity_status === "VERIFIED" && row.identity_source === "DIGILOCKER") throw new Error("DigiLocker already passed.");
    if (num(row.identity_attempts) >= 2 && row.identity_status !== "VERIFIED") {
      throw new Error("DigiLocker has been tried twice. An operator can pass this as a desk decision.");
    }
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    if (!request) throw new Error("Could not start DigiLocker from here.");
    const redirectUri = callbackUrlFrom(request);
    const state = crypto.randomUUID().replace(/-/g, "");
    await sql`delete from identity_oauth where user_id = ${context.userId} or expires_at < now()`;
    await sql`insert into identity_oauth (state, user_id, expires_at) values (${state}, ${context.userId}, now() + interval '10 minutes')`;
    return { url: digilockerAuthorizeUrl(partner.base, partner.clientId, redirectUri, state) };
  });

export const completeDigilocker = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const code = typeof o.code === "string" ? o.code.trim().slice(0, 512) : "";
    const state = typeof o.state === "string" ? o.state.trim().slice(0, 80) : "";
    const error = typeof o.error === "string" ? o.error.trim().slice(0, 80) : "";
    if (!state) throw new Error("DigiLocker did not return a session.");
    return { code, state, error };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const saved = await sql<{ user_id: string }>`
      delete from identity_oauth where state = ${data.state} and user_id = ${context.userId} and expires_at > now()
      returning user_id`;
    if (!saved.length) throw new Error("That DigiLocker session expired. Start again.");
    if (data.error || !data.code) {
      const decision = await recordIdentity(sql, context.userId, false);
      return { ok: false, status: decision.status, retry: !decision.closeThreads };
    }
    const partner = digilockerEnv();
    if (!partner.ready) throw new Error("DigiLocker partner keys are not on this deployment yet.");
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    if (!request) throw new Error("Could not finish DigiLocker from here.");
    const redirectUri = callbackUrlFrom(request);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: data.code,
      client_id: partner.clientId,
      client_secret: partner.clientSecret,
      redirect_uri: redirectUri,
    });
    const tokenRes = await fetch(`${partner.base}/oauth2/1/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${partner.clientId}:${partner.clientSecret}`).toString("base64")}`,
      },
      body,
    });
    const tokenJson: unknown = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok) {
      const decision = await recordIdentity(sql, context.userId, false);
      return { ok: false, status: decision.status, retry: !decision.closeThreads };
    }
    let judged = judgeDigilockerUser(tokenJson);
    if (!judged.ok) {
      const token = tokenJson && typeof tokenJson === "object" ? (tokenJson as Record<string, unknown>) : {};
      const access = typeof token.access_token === "string" ? token.access_token : "";
      if (access) {
        const userRes = await fetch(`${partner.base}/oauth2/1/user`, { headers: { authorization: `Bearer ${access}` } });
        const userJson: unknown = await userRes.json().catch(() => null);
        if (userRes.ok) judged = judgeDigilockerUser(userJson);
      }
    }
    if (!judged.ok) {
      const decision = await recordIdentity(sql, context.userId, false);
      return { ok: false, status: decision.status, retry: !decision.closeThreads };
    }
    const decision = await recordIdentity(sql, context.userId, true, judged.person);
    return { ok: true, status: decision.status, retry: false };
  });

export const agreeRent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(listingKey)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const apps = await sql<{ seeker_id: string; host_id: string; listing_id: string; status: string; rent: number; deposit: number; is_demo: boolean }>`
      select a.seeker_id, a.host_id, a.listing_id, a.status, l.monthly_rent as rent, l.deposit, l.is_demo
      from applications a join listings l on l.id = a.listing_id
      where a.id = ${data}`;
    const app = apps[0];
    if (!app || app.status !== "ACCEPTED") throw new Error("The owner has to say yes before this rent can be agreed.");
    if (app.seeker_id !== context.userId && app.host_id !== context.userId) throw new Error("That request is not yours.");
    if (bool(app.is_demo)) throw new Error("Sample rooms do not collect rent.");
    const rent = num(app.rent);
    const deposit = num(app.deposit);
    if (rent < FEE_INR) throw new Error("That rent is too small for the fee.");
    const existing = await sql<{ id: string; seeker_ok: boolean; host_ok: boolean; status: string }>`
      select id, seeker_ok, host_ok, status from rent_agreements where application_id = ${data}`;
    let id = existing[0]?.id;
    if (!id) {
      id = crypto.randomUUID();
      await sql`insert into rent_agreements (id, application_id, listing_id, seeker_id, host_id, rent_inr, deposit_inr) values (${id}, ${data}, ${app.listing_id}, ${app.seeker_id}, ${app.host_id}, ${rent}, ${deposit})`;
    }
    if (existing[0]?.status === "PAID") throw new Error("This rent is already paid.");
    if (context.userId === app.seeker_id) {
      await sql`update rent_agreements set seeker_ok = true, updated_at = now() where id = ${id}`;
    } else {
      await sql`update rent_agreements set host_ok = true, updated_at = now() where id = ${id}`;
    }
    const again = await sql<{ seeker_ok: boolean; host_ok: boolean }>`select seeker_ok, host_ok from rent_agreements where id = ${id}`;
    if (again[0]?.seeker_ok && again[0]?.host_ok) {
      await sql`update rent_agreements set status = 'AGREED', updated_at = now() where id = ${id} and status <> 'PAID'`;
    }
    return { ok: true, quote: rentQuote(rent, deposit) };
  });

export const startRentPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(listingKey)
  .handler(async ({ context, data }) => {
    const partner = razorpayEnv();
    if (!partner.ready) throw new Error("UPI or card needs the payments partner keys. The fee is ₹499 once, on the first month.");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      status: string;
      seeker_id: string;
      host_id: string;
      rent_inr: number;
      deposit_inr: number;
      seeker_ok: boolean;
      host_ok: boolean;
      seeker_identity: string;
      host_identity: string;
    }>`
      select g.id, g.status, g.seeker_id, g.host_id, g.rent_inr, g.deposit_inr, g.seeker_ok, g.host_ok,
             ps.identity_status as seeker_identity, ph.identity_status as host_identity
      from rent_agreements g
      join profiles ps on ps.user_id = g.seeker_id
      join profiles ph on ph.user_id = g.host_id
      where g.application_id = ${data}`;
    const deal = rows[0];
    if (!deal || deal.seeker_id !== context.userId) throw new Error("Only the seeker pays the rent.");
    if (!deal.seeker_ok || !deal.host_ok) throw new Error("Both sides have to accept the same rent first.");
    if (deal.seeker_identity !== "VERIFIED") throw new Error("Your identity has to pass before rent is collected.");
    if (deal.host_identity !== "VERIFIED") throw new Error("The owner's identity has to pass before rent is collected.");
    const captured = await sql<{ n: number }>`select count(*)::int as n from payments where agreement_id = ${deal.id} and status = 'CAPTURED' and purpose = 'Rent'`;
    const firstMonth = num(captured[0]?.n) === 0;
    const quote = rentQuote(num(deal.rent_inr), num(deal.deposit_inr), firstMonth);
    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${partner.keyId}:${partner.secret}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: quote.seekerPays * 100,
        currency: "INR",
        receipt: deal.id.slice(0, 40),
        notes: { agreementId: deal.id, feeInr: String(quote.seekerFee) },
      }),
    });
    const order = (await orderRes.json().catch(() => null)) as { id?: string; error?: { description?: string } } | null;
    if (!orderRes.ok || !order?.id) throw new Error(order?.error?.description || "The payments partner did not open a checkout.");
    await sql.query(
      `insert into payments (id, user_id, purpose, amount_inr, status, provider, provider_ref, fee_inr, rent_inr, host_payout_inr, agreement_id, payout_status)
       values ($1,$2,$3,$4,'CREATED','RAZORPAY',$5,$6,$7,$8,$9,'HELD')`,
      [crypto.randomUUID(), context.userId, "Rent", quote.seekerPays, order.id, quote.seekerFee, quote.rent, quote.hostReceives, deal.id],
    );
    return { keyId: partner.keyId, orderId: order.id, amount: quote.seekerPays * 100, quote };
  });

export const confirmRentPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const orderId = typeof o.orderId === "string" ? o.orderId.trim().slice(0, 80) : "";
    const paymentId = typeof o.paymentId === "string" ? o.paymentId.trim().slice(0, 80) : "";
    const signature = typeof o.signature === "string" ? o.signature.trim().slice(0, 128) : "";
    if (!orderId || !paymentId || !signature) throw new Error("The payment confirmation is incomplete.");
    return { orderId, paymentId, signature };
  })
  .handler(async ({ context, data }) => {
    const partner = razorpayEnv();
    if (!partner.ready) throw new Error("The payments partner is not configured.");
    const { razorpaySignatureMatches } = await import("@/lib/roomsetu/razorpay");
    if (!razorpaySignatureMatches(partner.secret, data.orderId, data.paymentId, data.signature)) {
      throw new Error("That payment signature does not match.");
    }
    const sql = await getSql();
    const rows = await sql<{ id: string; status: string; agreement_id: string | null; host_payout_inr: number }>`
      select id, status, agreement_id, host_payout_inr from payments
      where provider_ref = ${data.orderId} and user_id = ${context.userId} and purpose = 'Rent'`;
    const payment = rows[0];
    if (!payment) throw new Error("That rent payment was not found.");
    if (payment.status === "CAPTURED") return { ok: true };
    await sql`update payments set status = 'CAPTURED', provider_payment = ${data.paymentId}, payout_status = 'HELD' where id = ${payment.id}`;
    if (payment.agreement_id) {
      await sql`update rent_agreements set status = 'PAID', updated_at = now() where id = ${payment.agreement_id}`;
      const deal = await sql<{ host_id: string; rent_inr: number }>`select host_id, rent_inr from rent_agreements where id = ${payment.agreement_id}`;
      if (deal[0]) {
        await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${deal[0].host_id}, 'rent', 'Rent paid', 'Rent is in.', '/applications')`;
      }
    }
    return { ok: true };
  });

export const startPhoneOtp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const phone = normalizeIndianMobile(str(asRecord(input).phone));
    if (!phone) throw new Error("Enter a 10-digit Indian mobile number.");
    return phone;
  })
  .handler(async ({ context, data }) => {
    const provider = otpProviderFromEnv();
    if (!provider) throw new Error("Phone verification is not set up on this deployment yet.");
    const sql = await getSql();
    const taken = await sql`select 1 from profiles where phone_e164 = ${data} and phone_verified_at is not null and user_id <> ${context.userId} limit 1`;
    if (taken.length) throw new Error("That number is already verified on another account.");
    await hitLimit(sql, context.userId, "otp_send");
    const code = generateOtp();
    const ttl = otpTtlMinutes(provider);
    await sql`insert into phone_otps (user_id, phone_e164, code_hash, attempts, expires_at)
      values (${context.userId}, ${data}, ${hashOtp(context.userId, data, code)}, 0, now() + make_interval(mins => ${ttl}::int))
      on conflict (user_id) do update set phone_e164 = excluded.phone_e164, code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = now()`;
    await provider.send(data, `${code} is your roomeo code. It expires in ${ttl} minutes. Don't share it.`, code);
    return { ok: true, phone: data };
  });

export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const code = str(asRecord(input).code).replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code.");
    return code;
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await hitLimit(sql, context.userId, "otp_verify");
    // Count the attempt first, atomically, so parallel guesses can't exceed the cap.
    const rows = await sql<{ phone_e164: string; code_hash: string }>`
      update phone_otps set attempts = attempts + 1
      where user_id = ${context.userId} and expires_at > now() and attempts < ${OTP_MAX_ATTEMPTS}
      returning phone_e164, code_hash`;
    const otp = rows[0];
    if (!otp) throw new Error("That code has expired. Send a new one.");
    if (!otpMatches(otp.code_hash, context.userId, otp.phone_e164, data)) throw new Error("That code is not right.");
    await sql.query(
      `with done as (delete from phone_otps where user_id = $1 returning user_id),
       prof as (update profiles set phone_e164 = $2, mobile = $2, phone_verified_at = now(), updated_at = now() where user_id = $1 and exists (select 1 from done) returning user_id)
       insert into trust_checks (id, user_id, kind, status, note)
       select $3, user_id, 'PHONE', 'VERIFIED', 'Phone confirmed by one-time code.' from prof
       on conflict (user_id, kind) do update set status = 'VERIFIED', note = excluded.note, updated_at = now()`,
      [context.userId, otp.phone_e164, crypto.randomUUID()],
    );
    return { ok: true };
  });
