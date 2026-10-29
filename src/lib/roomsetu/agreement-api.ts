import { createServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { num, str } from "@/lib/roomsetu/map";
import { buildUpiLink, makeRef, upiPayee } from "@/lib/roomsetu/upi";
import { pricingConfig } from "@/lib/roomsetu/pricing";
import { agreementBody, agreementState, feeWithGst, refundableOnCancel, validSignName } from "@/lib/roomsetu/deal-agreement";
import { dealSteps } from "@/lib/roomsetu/deal-steps";
import { cancelAgreement, loadAgreement, signAgreement, signSquadAgreement, squadAgreementKey, squadSigners } from "@/lib/roomsetu/agreement-db";

/** A deal is either a 1:1 request (applications.id) or a squad request (squad_requests.id). */
type DealRef = { kind: "app" | "squad"; id: string };
function dealRef(input: unknown): DealRef {
  const r = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const kind = r.kind === "squad" ? "squad" : "app";
  const v = kind === "squad" ? r.id : (r.applicationId ?? r.id);
  if (typeof v !== "string" || !/^[0-9A-Za-z_-]{6,80}$/.test(v)) throw new Error("Unknown request.");
  return { kind, id: v };
}

async function clientIp(): Promise<string> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const h = getRequest()?.headers;
  return (h?.get("x-forwarded-for")?.split(",")[0] || h?.get("x-real-ip") || "").trim().slice(0, 64);
}

type Deal = {
  key: string; ownerId: string; tenantIds: string[]; leadTenantId: string; listingId: string; squadId: string | null; accepted: boolean; movedIn: boolean;
  terms: { listingTitle: string; address: string; city: string; locality: string; monthlyRent: number; deposit: number; moveIn: string; tenantName: string; ownerName: string };
};

async function resolveDeal(sql: Sql, ref: DealRef, userId: string): Promise<Deal> {
  const listingCols = `l.title, pr.address, l.city_name, l.locality_name, l.monthly_rent, l.deposit, l.available_from::text as available_from, op.full_name as owner_name`;
  if (ref.kind === "app") {
    const r = (await sql.query<Record<string, unknown>>(
      `select a.seeker_id, a.host_id, a.listing_id, a.status, ${listingCols}, sp.full_name as tenant_name,
              (select confirmed_at is not null from move_ins m where m.application_id = a.id) as moved
         from applications a join listings l on l.id = a.listing_id left join properties pr on pr.id = l.property_id
         left join profiles sp on sp.user_id = a.seeker_id left join profiles op on op.user_id = a.host_id where a.id = $1`, [ref.id]))[0];
    if (!r || (r.seeker_id !== userId && r.host_id !== userId)) throw new Error("Request not found.");
    return { key: ref.id, ownerId: str(r.host_id), tenantIds: [str(r.seeker_id)], leadTenantId: str(r.seeker_id), listingId: str(r.listing_id), squadId: null,
      accepted: str(r.status) === "ACCEPTED", movedIn: Boolean(r.moved), terms: termsOf(r, str(r.tenant_name) || "Tenant") };
  }
  const r = (await sql.query<Record<string, unknown>>(
    `select q.squad_id, q.owner_id, q.listing_id, q.status, s.name as squad_name, s.creator_id, ${listingCols},
            (select confirmed_at is not null from squad_move_ins m where m.squad_request_id = q.id) as moved
       from squad_requests q join squads s on s.id = q.squad_id join listings l on l.id = q.listing_id left join properties pr on pr.id = l.property_id
       left join profiles op on op.user_id = q.owner_id where q.id = $1`, [ref.id]))[0];
  if (!r) throw new Error("Request not found.");
  const members = (await sql.query<{ user_id: string; full_name: string | null }>(
    `select m.user_id, p.full_name from squad_members m left join profiles p on p.user_id = m.user_id where m.squad_id = $1 and m.left_at is null order by m.joined_at`, [str(r.squad_id)]));
  const ids = members.map((m) => m.user_id);
  if (r.owner_id !== userId && !ids.includes(userId)) throw new Error("Request not found.");
  const names = members.map((m) => m.full_name || "Member").join(", ");
  return { key: squadAgreementKey(ref.id), ownerId: str(r.owner_id), tenantIds: ids, leadTenantId: str(r.creator_id), listingId: str(r.listing_id), squadId: str(r.squad_id),
    accepted: str(r.status) === "ACCEPTED", movedIn: Boolean(r.moved), terms: termsOf(r, `Squad "${str(r.squad_name)}": ${names}`) };
}

function termsOf(r: Record<string, unknown>, tenantName: string): Deal["terms"] {
  return { listingTitle: str(r.title), address: str(r.address), city: str(r.city_name), locality: str(r.locality_name), monthlyRent: num(r.monthly_rent), deposit: num(r.deposit),
    moveIn: str(r.available_from).slice(0, 10), tenantName, ownerName: str(r.owner_name) || "Owner" };
}

/** Read (and on first look, draft) the agreement for an accepted 1:1 or squad request. */
export const getDealAgreement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((i: unknown) => dealRef(i))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const cfg = pricingConfig();
    const d = await resolveDeal(sql, data, context.userId);
    let a = await loadAgreement(sql, d.key);
    if (!a && d.accepted) {
      const terms = { ...d.terms, feeBaseInr: cfg.successFeeTenantInr };
      await sql.query(`insert into deal_agreements (id, application_id, listing_id, seeker_id, owner_id, terms_json, body, squad_request_id)
        values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (application_id) do nothing`,
        [crypto.randomUUID(), d.key, d.listingId, d.leadTenantId, d.ownerId, JSON.stringify(terms), agreementBody(terms), data.kind === "squad" ? data.id : null]);
      a = await loadAgreement(sql, d.key);
    }
    if (!a) return null;
    const isOwner = context.userId === d.ownerId;
    const signers = data.kind === "squad" ? await squadSigners(sql, str(a.id)) : [];
    const iSigned = data.kind === "squad" ? signers.some((x) => x.user_id === context.userId) : Boolean(isOwner ? a.owner_signed_at : a.seeker_signed_at);
    const base = isOwner ? cfg.successFeeOwnerInr : cfg.successFeeTenantInr;
    const fee = (await sql.query<{ id: string; status: string }>(`select id, status from payments where agreement_id = $1 and kind = 'SUCCESS_FEE' and user_id = $2 order by created_at desc limit 1`, [str(a.id), context.userId]))[0];
    const state = agreementState({ seekerSignedAt: str(a.seeker_signed_at) || (signers.some((x) => x.role === "TENANT") ? "x" : null), ownerSignedAt: str(a.owner_signed_at) || null, issuedAt: str(a.issued_at) || null, cancelledAt: str(a.cancelled_at) || null });
    const feeOn = cfg.successFeeEnabled && base > 0;
    const f = feeWithGst(base);
    return {
      kind: data.kind,
      body: str(a.body),
      state,
      role: isOwner ? ("owner" as const) : ("tenant" as const),
      iSigned,
      seeker: { name: str(a.seeker_name), at: str(a.seeker_signed_at) },
      owner: { name: str(a.owner_name), at: str(a.owner_signed_at) },
      squad: data.kind === "squad" ? { members: d.tenantIds.length, signed: signers.filter((x) => x.role === "TENANT").length, names: signers.map((x) => x.name) } : null,
      issuedAt: str(a.issued_at),
      cancelledAt: str(a.cancelled_at),
      canRefund: refundableOnCancel(str(a.issued_at) || null),
      feeEnabled: feeOn,
      fee: f,
      feeStatus: str(fee?.status),
      feePaymentId: fee?.status === "PAID" ? str(fee.id) : "",
      steps: dealSteps({ role: isOwner ? "owner" : "tenant", squad: data.kind === "squad", iSigned, issued: Boolean(a.issued_at), cancelled: Boolean(a.cancelled_at), feeOn, feePaid: fee?.status === "PAID", feeTotal: f.total, movedIn: d.movedIn }),
    };
  });

export const signDealAgreement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => ({ ref: dealRef(i), name: validSignName((i as Record<string, unknown>)?.name) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const d = await resolveDeal(sql, data.ref, context.userId);
    const ip = await clientIp();
    const a = data.ref.kind === "squad"
      ? await signSquadAgreement(sql, { requestId: data.ref.id, userId: context.userId, ownerId: d.ownerId, memberIds: d.tenantIds, name: data.name, ip })
      : await signAgreement(sql, { applicationId: d.key, userId: context.userId, name: data.name, ip });
    if (a?.issued_at) {
      for (const u of [d.ownerId, ...d.tenantIds].filter((x) => x !== context.userId)) {
        await sql.query(`insert into notifications (id, user_id, kind, title, body, href) values ($1,$2,'application','Agreement signed by everyone 🎉','Your Roomeo agreement is issued. Next up: the one-time fee, then move in.',$3)`,
          [crypto.randomUUID(), u, data.ref.kind === "squad" ? "/squads" : "/applications"]);
      }
    }
    return { issued: Boolean(a?.issued_at) };
  });

export const cancelDealAgreement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => ({ ref: dealRef(i), reason: String((i as Record<string, unknown>)?.reason ?? "").slice(0, 300) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const d = await resolveDeal(sql, data.ref, context.userId);
    return cancelAgreement(sql, { applicationId: d.key, userId: context.userId, reason: data.reason, parties: [d.ownerId, ...d.tenantIds] });
  });

/** ₹999 + GST per person, once per agreement, payable after everyone signs and before move in. */
export const startAgreementFee = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((i: unknown) => dealRef(i))
  .handler(async ({ context, data }) => {
    const cfg = pricingConfig();
    if (!cfg.successFeeEnabled) throw new Error("No success fee right now.");
    const payee = upiPayee();
    if (!payee.ready) throw new Error("UPI payments are not set up yet.");
    const sql = await getSql();
    const d = await resolveDeal(sql, data, context.userId);
    const a = await loadAgreement(sql, d.key);
    if (!a) throw new Error("Agreement not found.");
    if (a.cancelled_at) throw new Error("This agreement was cancelled.");
    if (!a.issued_at) throw new Error("Everyone signs the agreement first.");
    const isOwner = d.ownerId === context.userId;
    const fee = feeWithGst(isOwner ? cfg.successFeeOwnerInr : cfg.successFeeTenantInr);
    if (fee.base <= 0) throw new Error("No success fee for you.");
    const find = () => sql.query<{ ref: string; status: string; amount_inr: number }>(`select ref, status, amount_inr from payments
      where agreement_id = $1 and kind = 'SUCCESS_FEE' and user_id = $2 and status in ('PENDING','SUBMITTED','PAID') order by created_at desc limit 1`, [str(a.id), context.userId]);
    let row = (await find())[0];
    if (row?.status === "PAID") throw new Error("Already paid. Thanks!");
    if (!row) {
      await sql.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, agreement_id, squad_id)
        values ($1,$2,$3,$4,'PENDING','UPI',$5,'SUCCESS_FEE',$6,$7,$8)`,
        [crypto.randomUUID(), context.userId, `Success fee (${isOwner ? "owner" : d.squadId ? "squad member" : "tenant"}) ₹${fee.base} + ₹${fee.gst.toFixed(2)} GST`, fee.total, makeRef(), d.listingId, str(a.id), d.squadId]);
      row = (await find())[0];
    }
    const link = buildUpiLink({ vpa: payee.vpa, name: payee.name, amountInr: num(row.amount_inr), ref: str(row.ref) });
    const qr = await QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M" });
    return { ref: str(row.ref), status: str(row.status), amount: num(row.amount_inr), plan: "the one-time success fee (incl. GST)", payee: payee.name, vpa: payee.vpa, link, qr };
  });

/** Invoice for one PAID success-fee payment. Visible to the payer and to admins. */
export const getFeeInvoice = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((i: unknown) => {
    const v = i && typeof i === "object" ? (i as Record<string, unknown>).paymentId : undefined;
    if (typeof v !== "string" || !/^[0-9A-Za-z_-]{6,80}$/.test(v)) throw new Error("Unknown invoice.");
    return v;
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const inv = (await sql.query<Record<string, unknown>>(`select i.*, i.issued_at::text as issued, p.ref, p.purpose from fee_invoices i join payments p on p.id = i.payment_id where i.payment_id = $1`, [data]))[0];
    if (!inv) throw new Error("No invoice yet. It shows up once Roomeo confirms the payment.");
    if (inv.user_id !== context.userId) {
      const roles = (await sql.query<{ role: string }>(`select role from profile_roles where user_id = $1`, [context.userId])).map((r) => r.role);
      if (!roles.includes("ADMIN") && !roles.includes("SUPER_ADMIN")) throw new Error("No invoice yet. It shows up once Roomeo confirms the payment.");
    }
    return {
      number: str(inv.number), issuedAt: str(inv.issued), buyerName: str(inv.buyer_name), buyerState: str(inv.buyer_state), placeOfSupply: str(inv.place_of_supply),
      taxable: num(inv.taxable_paise), cgst: num(inv.cgst_paise), sgst: num(inv.sgst_paise), igst: num(inv.igst_paise), total: num(inv.total_paise), roundOff: num(inv.round_off_paise),
      paidInr: num(inv.paid_inr), ref: str(inv.ref), purpose: str(inv.purpose),
    };
  });
