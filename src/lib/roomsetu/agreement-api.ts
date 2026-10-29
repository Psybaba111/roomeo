import { createServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { num, str } from "@/lib/roomsetu/map";
import { buildUpiLink, makeRef, upiPayee } from "@/lib/roomsetu/upi";
import { pricingConfig } from "@/lib/roomsetu/pricing";
import { agreementBody, agreementState, feeWithGst, refundableOnCancel, validSignName } from "@/lib/roomsetu/deal-agreement";
import { cancelAgreement, loadAgreement, signAgreement } from "@/lib/roomsetu/agreement-db";

function appKey(input: unknown): string {
  const v = input && typeof input === "object" ? (input as Record<string, unknown>).applicationId : undefined;
  if (typeof v !== "string" || !/^[0-9A-Za-z_-]{6,80}$/.test(v)) throw new Error("Unknown request.");
  return v;
}

async function clientIp(): Promise<string> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const h = getRequest()?.headers;
  return (h?.get("x-forwarded-for")?.split(",")[0] || h?.get("x-real-ip") || "").trim().slice(0, 64);
}

/** Read (and on first look, draft) the deal agreement for an ACCEPTED request. */
export const getDealAgreement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((i: unknown) => appKey(i))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const cfg = pricingConfig();
    const apps = await sql<Record<string, unknown>>`
      select a.seeker_id, a.host_id, a.listing_id, a.status, l.title, pr.address, l.city_name, l.locality_name, l.monthly_rent, l.deposit,
             l.available_from::text as available_from, sp.full_name as tenant_name, op.full_name as owner_name
        from applications a join listings l on l.id = a.listing_id left join properties pr on pr.id = l.property_id
        left join profiles sp on sp.user_id = a.seeker_id left join profiles op on op.user_id = a.host_id
       where a.id = ${data}`;
    const app = apps[0];
    if (!app || (app.seeker_id !== context.userId && app.host_id !== context.userId)) throw new Error("Request not found.");
    let a = await loadAgreement(sql, data);
    if (!a && str(app.status) === "ACCEPTED") {
      const terms = {
        listingTitle: str(app.title), address: str(app.address), city: str(app.city_name), locality: str(app.locality_name),
        monthlyRent: num(app.monthly_rent), deposit: num(app.deposit), moveIn: str(app.available_from).slice(0, 10),
        tenantName: str(app.tenant_name) || "Tenant", ownerName: str(app.owner_name) || "Owner", feeBaseInr: cfg.successFeeTenantInr,
      };
      await sql`insert into deal_agreements (id, application_id, listing_id, seeker_id, owner_id, terms_json, body)
        values (${crypto.randomUUID()}, ${data}, ${str(app.listing_id)}, ${str(app.seeker_id)}, ${str(app.host_id)}, ${JSON.stringify(terms)}, ${agreementBody(terms)})
        on conflict (application_id) do nothing`;
      a = await loadAgreement(sql, data);
    }
    if (!a) return null;
    const tenant = context.userId === a.seeker_id;
    const base = tenant ? cfg.successFeeTenantInr : cfg.successFeeOwnerInr;
    const fee = await sql<{ status: string }>`select status from payments where agreement_id = ${str(a.id)} and kind = 'SUCCESS_FEE' and user_id = ${context.userId} order by created_at desc limit 1`;
    return {
      body: str(a.body),
      state: agreementState({ seekerSignedAt: str(a.seeker_signed_at) || null, ownerSignedAt: str(a.owner_signed_at) || null, issuedAt: str(a.issued_at) || null, cancelledAt: str(a.cancelled_at) || null }),
      role: tenant ? ("tenant" as const) : ("owner" as const),
      iSigned: Boolean(tenant ? a.seeker_signed_at : a.owner_signed_at),
      seeker: { name: str(a.seeker_name), at: str(a.seeker_signed_at) },
      owner: { name: str(a.owner_name), at: str(a.owner_signed_at) },
      issuedAt: str(a.issued_at),
      cancelledAt: str(a.cancelled_at),
      canRefund: refundableOnCancel(str(a.issued_at) || null),
      feeEnabled: cfg.successFeeEnabled && base > 0,
      fee: feeWithGst(base),
      feeStatus: str(fee[0]?.status),
    };
  });

export const signDealAgreement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => ({ applicationId: appKey(i), name: validSignName((i as Record<string, unknown>)?.name) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const a = await signAgreement(sql, { applicationId: data.applicationId, userId: context.userId, name: data.name, ip: await clientIp() });
    if (a?.issued_at) {
      const other = context.userId === a.seeker_id ? str(a.owner_id) : str(a.seeker_id);
      await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${other}, 'application', 'Agreement signed by both 🎉', 'Your Roomeo agreement is issued. Check the next step in Requests.', '/applications')`;
    }
    return { issued: Boolean(a?.issued_at) };
  });

export const cancelDealAgreement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => ({ applicationId: appKey(i), reason: String((i as Record<string, unknown>)?.reason ?? "").slice(0, 300) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return cancelAgreement(sql, { applicationId: data.applicationId, userId: context.userId, reason: data.reason });
  });

/** ₹999 + GST per side, once per agreement, payable after both sign and before move in. */
export const startAgreementFee = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => appKey(i))
  .handler(async ({ context, data }) => {
    const cfg = pricingConfig();
    if (!cfg.successFeeEnabled) throw new Error("No success fee right now.");
    const payee = upiPayee();
    if (!payee.ready) throw new Error("UPI payments are not set up yet.");
    const sql = await getSql();
    const a = await loadAgreement(sql, data);
    if (!a || (a.seeker_id !== context.userId && a.owner_id !== context.userId)) throw new Error("Agreement not found.");
    if (a.cancelled_at) throw new Error("This agreement was cancelled.");
    if (!a.issued_at) throw new Error("Both of you sign the agreement first.");
    const tenant = a.seeker_id === context.userId;
    const fee = feeWithGst(tenant ? cfg.successFeeTenantInr : cfg.successFeeOwnerInr);
    if (fee.base <= 0) throw new Error("No success fee for you.");
    const find = () => sql<{ ref: string; status: string; amount_inr: number }>`select ref, status, amount_inr from payments
      where agreement_id = ${str(a.id)} and kind = 'SUCCESS_FEE' and user_id = ${context.userId} and status in ('PENDING','SUBMITTED','PAID') order by created_at desc limit 1`;
    let row = (await find())[0];
    if (row?.status === "PAID") throw new Error("Already paid. Thanks!");
    if (!row) {
      await sql`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, agreement_id)
        values (${crypto.randomUUID()}, ${context.userId}, ${`Success fee (${tenant ? "tenant" : "owner"}) ₹${fee.base} + ₹${fee.gst.toFixed(2)} GST`}, ${fee.total}, 'PENDING', 'UPI', ${makeRef()}, 'SUCCESS_FEE', ${str(a.listing_id)}, ${str(a.id)})`;
      row = (await find())[0];
    }
    const link = buildUpiLink({ vpa: payee.vpa, name: payee.name, amountInr: num(row.amount_inr), ref: str(row.ref) });
    const qr = await QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M" });
    return { ref: str(row.ref), status: str(row.status), amount: num(row.amount_inr), plan: "the one-time success fee (incl. GST)", payee: payee.name, vpa: payee.vpa, link, qr };
  });
