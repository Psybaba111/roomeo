import { createServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { num, str } from "@/lib/roomsetu/map";
import { buildUpiLink, makeRef, upiPayee } from "@/lib/roomsetu/upi";
import { pricingConfig } from "@/lib/roomsetu/pricing";
import { tenantFeeWithTrialCredit } from "@/lib/roomsetu/trial-db";
import { agreementBody, agreementBodyForView, agreementState, feeWithGst, refundableOnVacate, refundDeadline, validSignName } from "@/lib/roomsetu/deal-agreement";
import { dealSteps } from "@/lib/roomsetu/deal-steps";
import { pdfBase64 } from "@/lib/roomsetu/pdf";
import { invoicePdfLines, type InvoiceView } from "@/lib/roomsetu/invoice";
import { cancelAgreement, invoiceSnapshotReady, loadAgreement, signAgreement, signSquadAgreement, squadAgreementKey, squadSigners } from "@/lib/roomsetu/agreement-db";

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
    const fee = (await sql.query<{ id: string; status: string; paid_at: string; amount_inr: number; trial_credit_inr: number }>(`select id, status, coalesce(reviewed_at, created_at)::text as paid_at, amount_inr, coalesce(trial_credit_inr, 0) as trial_credit_inr from payments where agreement_id = $1 and kind = 'SUCCESS_FEE' and user_id = $2 order by created_at desc limit 1`, [str(a.id), context.userId]))[0];
    const state = agreementState({ seekerSignedAt: str(a.seeker_signed_at) || (signers.some((x) => x.role === "TENANT") ? "x" : null), ownerSignedAt: str(a.owner_signed_at) || null, issuedAt: str(a.issued_at) || null, cancelledAt: str(a.cancelled_at) || null });
    const feeOn = cfg.successFeeEnabled && base > 0;
    const f = feeWithGst(base);
    // What this person actually pays: the open/paid payment row if any, else ₹589 less a ₹99 trial credit if one applies.
    let trialCredit = 0;
    if (fee) trialCredit = num(fee.trial_credit_inr);
    else if (!isOwner && feeOn && a.issued_at) trialCredit = (await tenantFeeWithTrialCredit(sql, context.userId, f.total, str(a.issued_at))).credit;
    const payable = fee && ["PENDING", "SUBMITTED", "PAID"].includes(fee.status) ? num(fee.amount_inr) : f.total - trialCredit;
    const refundState = fee?.status === "REFUND_DUE" || fee?.status === "REFUNDED" ? fee.status : "";
    return {
      kind: data.kind,
      body: agreementBodyForView(str(a.body), d.terms, Boolean(a.issued_at)),
      state,
      role: isOwner ? ("owner" as const) : ("tenant" as const),
      iSigned,
      seeker: { name: str(a.seeker_name), at: str(a.seeker_signed_at) },
      owner: { name: str(a.owner_name), at: str(a.owner_signed_at) },
      squad: data.kind === "squad" ? { members: d.tenantIds.length, signed: signers.filter((x) => x.role === "TENANT").length, names: signers.map((x) => x.name) } : null,
      issuedAt: str(a.issued_at),
      cancelledAt: str(a.cancelled_at),
      canRefund: fee?.status === "PAID" && refundableOnVacate(fee.paid_at, new Date()),
      refundBy: fee?.status === "PAID" ? refundDeadline(fee.paid_at) : "",
      feeEnabled: feeOn,
      fee: f,
      trialCredit,
      payable,
      refundState,
      feeStatus: str(fee?.status),
      feePaymentId: fee?.status === "PAID" ? str(fee.id) : "",
      steps: dealSteps({ role: isOwner ? "owner" : "tenant", squad: data.kind === "squad", iSigned, issued: Boolean(a.issued_at), cancelled: Boolean(a.cancelled_at), feeOn, feePaid: fee?.status === "PAID" || Boolean(refundState), feeTotal: payable, movedIn: d.movedIn }),
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

/** ₹499 + GST (₹589) per person, once per agreement, payable after everyone signs and before move in. */
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
    const refunded = (await sql.query<{ status: string }>(`select status from payments where agreement_id = $1 and kind = 'SUCCESS_FEE' and user_id = $2 and status in ('REFUND_DUE','REFUNDED') limit 1`, [str(a.id), context.userId]))[0];
    if (!row && refunded) throw new Error(refunded.status === "REFUND_DUE" ? "Your fee refund is pending admin approval. Nothing to pay." : "Your fee was refunded. Nothing to pay.");
    if (!row) {
      // Trial nights (1 Nov 2026): a tenant whose paid trial ended within 14 days of this deal gets ₹99 off.
      const credit = isOwner ? { amount: fee.total, credit: 0, bookingId: null } : await tenantFeeWithTrialCredit(sql, context.userId, fee.total, str(a.issued_at));
      const creditNote = credit.credit > 0 ? `, less ₹${credit.credit} trial credit` : "";
      await sql.query(`insert into payments (id, user_id, purpose, amount_inr, status, provider, ref, kind, listing_id, agreement_id, squad_id, trial_credit_inr, trial_credit_booking_id)
        values ($1,$2,$3,$4,'PENDING','UPI',$5,'SUCCESS_FEE',$6,$7,$8,$9,$10)`,
        [crypto.randomUUID(), context.userId, `Success fee (${isOwner ? "owner" : d.squadId ? "squad member" : "tenant"}) ₹${fee.base} + ₹${fee.gst.toFixed(2)} GST${creditNote}`, credit.amount, makeRef(), d.listingId, str(a.id), d.squadId, credit.credit, credit.bookingId]);
      row = (await find())[0];
    }
    const link = buildUpiLink({ vpa: payee.vpa, name: payee.name, amountInr: num(row.amount_inr), ref: str(row.ref) });
    const qr = await QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M" });
    return { ref: str(row.ref), status: str(row.status), amount: num(row.amount_inr), plan: "the one-time success fee (incl. GST)", payee: payee.name, vpa: payee.vpa, link, qr };
  });

const invoiceIdInput = (i: unknown) => {
  const v = i && typeof i === "object" ? (i as Record<string, unknown>).paymentId : undefined;
  if (typeof v !== "string" || !/^[0-9A-Za-z_-]{6,80}$/.test(v)) throw new Error("Unknown invoice.");
  return v;
};

/** Loads one invoice for the payer or an admin. Uses the 0024 snapshot when present, else live profile data. */
async function loadInvoiceView(sql: Sql, paymentId: string, userId: string): Promise<InvoiceView> {
  const snap = await invoiceSnapshotReady(sql);
  const inv = (await sql.query<Record<string, unknown>>(
    `select i.*, i.issued_at::text as issued, p.ref, p.purpose, p.utr as pay_utr, coalesce(p.trial_credit_inr, 0) as trial_credit_inr, pr.phone_e164 as live_phone, u.email as live_email,
            p.kind as pay_kind, tb.id as tb_id, tb.check_in::text as tb_check_in, tb.nights as tb_nights, tl.title as tb_title,
            (select fi2.number from trial_bookings cb join fee_invoices fi2 on fi2.payment_id = cb.fee_payment_id where cb.id = p.trial_credit_booking_id limit 1) as trial_invoice_no
     ${snap ? "" : ", null::text as buyer_email, null::text as buyer_phone, null::text as buyer_gstin, null::text as utr"}
     from fee_invoices i join payments p on p.id = i.payment_id left join profiles pr on pr.user_id = i.user_id left join "user" u on u.id = i.user_id
     left join trial_bookings tb on tb.id = p.trial_booking_id and p.kind = 'TRIAL_FEE' left join listings tl on tl.id = tb.listing_id
     where i.payment_id = $1`, [paymentId]))[0];
  const none = "No invoice yet. It shows up once Roomeo confirms the payment.";
  if (!inv) throw new Error(none);
  if (inv.user_id !== userId) {
    const roles = (await sql.query<{ role: string }>(`select role from profile_roles where user_id = $1`, [userId])).map((r) => r.role);
    if (!roles.includes("ADMIN") && !roles.includes("SUPER_ADMIN")) throw new Error(none);
  }
  return {
    number: str(inv.number), issuedAt: str(inv.issued), buyerName: str(inv.buyer_name),
    buyerEmail: str(inv.buyer_email) || str(inv.live_email), buyerPhone: str(inv.buyer_phone) || str(inv.live_phone), buyerGstin: str(inv.buyer_gstin),
    buyerState: str(inv.buyer_state), placeOfSupply: str(inv.place_of_supply),
    taxable: num(inv.taxable_paise), cgst: num(inv.cgst_paise), sgst: num(inv.sgst_paise), igst: num(inv.igst_paise), total: num(inv.total_paise), roundOff: num(inv.round_off_paise),
    paidInr: num(inv.paid_inr), ref: str(inv.ref), utr: str(inv.utr) || str(inv.pay_utr), purpose: str(inv.purpose), trialCreditInr: num(inv.trial_credit_inr),
    kind: str(inv.pay_kind) === "TRIAL_FEE" ? "TRIAL_FEE" : "SUCCESS_FEE",
    trialInvoiceNo: str(inv.trial_invoice_no),
    trial: inv.tb_id ? { bookingId: str(inv.tb_id), listingTitle: str(inv.tb_title), checkIn: str(inv.tb_check_in), nights: num(inv.tb_nights) } : undefined,
  };
}

/** Invoice for one PAID success-fee payment. Visible to the payer and to admins. */
export const getFeeInvoice = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(invoiceIdInput)
  .handler(async ({ context, data }) => loadInvoiceView(await getSql(), data, context.userId));

/** Same invoice as a PDF (base64), for the download button. */
export const getFeeInvoicePdf = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(invoiceIdInput)
  .handler(async ({ context, data }) => {
    const v = await loadInvoiceView(await getSql(), data, context.userId);
    return { filename: `roomeo-invoice-${v.number.replace(/\//g, "-")}.pdf`, base64: pdfBase64(invoicePdfLines(v)) };
  });
