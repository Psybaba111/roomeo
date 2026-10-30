import { istToday } from "./dates.ts";
import type { Sql } from "../db.ts";
import { confirmMoveInRecord, signedKey } from "./movein-confirm.ts";
import {
  DEFAULT_HOUSE_RULES,
  MIN_STAY_MONTHS,
  NOTICE_DAYS,
  agreementText,
  depositBalance,
  isFromMangaluru,
  maskId,
  policeFormLines,
  refundDueOn,
  type AgreementInput,
  type IdType,
  type MoveInDetails,
} from "./movein.ts";

export type Role = "owner" | "tenant";
type InviteRow = {
  id: string;
  token: string;
  listing_id: string;
  owner_id: string;
  tenant_id: string | null;
  bed_label: string;
  rent_inr: number;
  deposit_inr: number;
  start_date: string;
  min_stay_months: number;
  notice_days: number;
  house_rules: string;
  status: string;
  title: string;
  address: string;
  owner_name: string;
  owner_phone: string | null;
};

const INVITE_COLS = `i.id, i.token, i.listing_id, i.owner_id, i.tenant_id, i.bed_label, i.rent_inr, i.deposit_inr, i.start_date::text as start_date,
  i.min_stay_months, i.notice_days, i.house_rules, i.status, l.title, coalesce(p.address, l.locality_name || ', ' || l.city_name) as address,
  coalesce(op.full_name, 'Owner') as owner_name, op.mobile as owner_phone`;
const INVITE_FROM = `from movein_invites i join listings l on l.id = i.listing_id left join properties p on p.id = l.property_id left join profiles op on op.user_id = i.owner_id`;

export function newToken(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return Buffer.from(b).toString("base64url");
}

export async function createInvite(
  sql: Sql,
  ownerId: string,
  d: { listingId: string; bedLabel: string; rentInr: number | null; depositInr: number | null; startDate: string; houseRules: string },
) {
  const l = (await sql<{ owner_id: string; monthly_rent: number; deposit: number }>`select owner_id, monthly_rent, deposit from listings where id = ${d.listingId}`)[0];
  if (!l || l.owner_id !== ownerId) throw new Error("You can only send move-in links for your own listings.");
  const id = crypto.randomUUID();
  const token = newToken();
  await sql`insert into movein_invites (id, token, listing_id, owner_id, bed_label, rent_inr, deposit_inr, start_date, min_stay_months, notice_days, house_rules)
    values (${id}, ${token}, ${d.listingId}, ${ownerId}, ${d.bedLabel}, ${d.rentInr ?? Number(l.monthly_rent)}, ${d.depositInr ?? Number(l.deposit)},
      ${d.startDate}::date, ${MIN_STAY_MONTHS}, ${NOTICE_DAYS}, ${d.houseRules || DEFAULT_HOUSE_RULES})`;
  return { id, token };
}

async function inviteById(sql: Sql, id: string) {
  return (await sql.query(`select ${INVITE_COLS} ${INVITE_FROM} where i.id = $1`, [id]))[0] as InviteRow | undefined;
}

/** Owner or the claimed tenant, else throws. Every read/write of move-in data goes through this. */
export async function access(sql: Sql, inviteId: string, userId: string): Promise<{ role: Role; inv: InviteRow }> {
  const inv = await inviteById(sql, inviteId);
  if (inv && inv.owner_id === userId) return { role: "owner", inv };
  if (inv && inv.tenant_id === userId) return { role: "tenant", inv };
  throw new Error("Move-in not found.");
}

/** Opening the link claims it for the signed-in tenant (first come). Owners see their own link read-only. */
export async function openInvite(sql: Sql, token: string, userId: string) {
  const row = (await sql<{ id: string; owner_id: string; tenant_id: string | null; status: string }>`select id, owner_id, tenant_id, status from movein_invites where token = ${token}`)[0];
  if (!row || row.status === "CANCELLED") throw new Error("This move-in link isn't valid anymore. Ask your PG owner for a fresh one.");
  if (row.owner_id !== userId && !row.tenant_id) {
    await sql`update movein_invites set tenant_id = ${userId}, updated_at = now() where id = ${row.id} and tenant_id is null`;
  }
  return access(sql, row.id, userId);
}

export async function submitDetails(sql: Sql, inviteId: string, userId: string, d: MoveInDetails, img: { mime: string; base64: string }) {
  const { role, inv } = await access(sql, inviteId, userId);
  if (role !== "tenant") throw new Error("Only the resident fills this in.");
  if (inv.status === "SIGNED") throw new Error("Already signed. Ask your owner if something needs fixing.");
  const outside = !isFromMangaluru(d.homeCity, d.homePincode);
  await sql`insert into movein_details (invite_id, full_name, phone, email, date_of_birth, occupation, employer, home_address, home_city, home_state, home_pincode, emergency_name, emergency_phone, id_type, id_last4, outside_mangaluru)
    values (${inviteId}, ${d.fullName}, ${d.phone}, ${d.email}, ${d.dateOfBirth}::date, ${d.occupation}, ${d.employer}, ${d.homeAddress}, ${d.homeCity}, ${d.homeState}, ${d.homePincode}, ${d.emergencyName}, ${d.emergencyPhone}, ${d.idType}, ${d.idLast4}, ${outside})
    on conflict (invite_id) do update set full_name = excluded.full_name, phone = excluded.phone, email = excluded.email, date_of_birth = excluded.date_of_birth,
      occupation = excluded.occupation, employer = excluded.employer, home_address = excluded.home_address, home_city = excluded.home_city, home_state = excluded.home_state,
      home_pincode = excluded.home_pincode, emergency_name = excluded.emergency_name, emergency_phone = excluded.emergency_phone, id_type = excluded.id_type,
      id_last4 = excluded.id_last4, outside_mangaluru = excluded.outside_mangaluru, submitted_at = now()`;
  await sql`insert into movein_id_docs (invite_id, mime, data_base64) values (${inviteId}, ${img.mime}, ${img.base64})
    on conflict (invite_id) do update set mime = excluded.mime, data_base64 = excluded.data_base64, uploaded_at = now()`;
  await sql`update movein_invites set status = 'SUBMITTED', updated_at = now() where id = ${inviteId}`;
  return { outsideMangaluru: outside };
}

type DetailRow = {
  full_name: string; phone: string; email: string; date_of_birth: string | null; occupation: string; employer: string; home_address: string;
  home_city: string; home_state: string; home_pincode: string; emergency_name: string; emergency_phone: string; id_type: string; id_last4: string; outside_mangaluru: boolean;
};
async function details(sql: Sql, inviteId: string) {
  return (await sql<DetailRow>`select full_name, phone, email, date_of_birth::text as date_of_birth, occupation, employer, home_address, home_city, home_state, home_pincode,
    emergency_name, emergency_phone, id_type, id_last4, outside_mangaluru from movein_details where invite_id = ${inviteId}`)[0];
}

export function agreementInput(inv: InviteRow, tenantName: string, madeOn: string = istToday()): AgreementInput {
  return {
    ownerName: inv.owner_name,
    tenantName,
    propertyTitle: inv.title,
    propertyAddress: inv.address,
    bedLabel: inv.bed_label,
    rentInr: Number(inv.rent_inr),
    depositInr: Number(inv.deposit_inr),
    startDate: inv.start_date,
    madeOn,
    minStayMonths: Number(inv.min_stay_months),
    noticeDays: Number(inv.notice_days),
    houseRules: inv.house_rules,
  };
}

export async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Buffer.from(h).toString("hex");
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function signAgreement(sql: Sql, inviteId: string, userId: string, typedName: string, meta: { ip: string; userAgent: string }) {
  const { role, inv } = await access(sql, inviteId, userId);
  if (role !== "tenant") throw new Error("Only the resident signs here.");
  const d = await details(sql, inviteId);
  if (!d) throw new Error("Fill in your details and ID first.");
  if (norm(typedName) !== norm(d.full_name)) throw new Error(`Type your name exactly as "${d.full_name}" to sign.`);
  const hash = await sha256Hex(agreementText(agreementInput(inv, d.full_name, istToday())).join("\n"));
  const r = await sql<{ signed_at: string }>`insert into movein_signatures (invite_id, typed_name, ip, user_agent, agreement_sha256)
    values (${inviteId}, ${typedName.trim()}, ${meta.ip}, ${meta.userAgent}, ${hash}) on conflict (invite_id) do nothing returning signed_at::text as signed_at`;
  await sql`update movein_invites set status = 'SIGNED', updated_at = now() where id = ${inviteId}`;
  // Signing = both sides agreed (owner sent the terms, tenant signed), so it counts as a confirmed move-in.
  // Reuse the tenant's accepted request for this listing if there is one, else key the record to the invite.
  const app = (await sql<{ id: string }>`select id from applications where seeker_id = ${userId} and listing_id = ${inv.listing_id} and status = 'ACCEPTED' order by created_at desc limit 1`)[0];
  await confirmMoveInRecord(sql, {
    applicationId: app?.id ?? signedKey(inviteId), listingId: inv.listing_id, seekerId: userId, ownerId: inv.owner_id,
    side: "both", notifyUserId: inv.owner_id, notifyBody: `${d.full_name} signed the move-in agreement. Move in confirmed.`,
  });
  return { signed: true, already: r.length === 0 };
}

export async function idDoc(sql: Sql, inviteId: string, userId: string) {
  await access(sql, inviteId, userId);
  const r = (await sql<{ mime: string; data_base64: string }>`select mime, data_base64 from movein_id_docs where invite_id = ${inviteId}`)[0];
  if (!r) throw new Error("No ID uploaded yet.");
  return `data:${r.mime};base64,${r.data_base64}`;
}

export async function agreementDoc(sql: Sql, inviteId: string, userId: string) {
  const { inv } = await access(sql, inviteId, userId);
  const d = await details(sql, inviteId);
  const row = (await sql<{ typed_name: string; signed_at: string; signed_on: string; ip: string; agreement_sha256: string }>`select typed_name, to_char(signed_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') || ' IST' as signed_at,
    (signed_at at time zone 'Asia/Kolkata')::date::text as signed_on, ip, agreement_sha256 from movein_signatures where invite_id = ${inviteId}`)[0];
  const s = row ? { typed_name: row.typed_name, signed_at: row.signed_at, ip: row.ip, agreement_sha256: row.agreement_sha256 } : undefined;
  // "Made on" = the day it was signed (IST); while unsigned, today.
  return { text: agreementText(agreementInput(inv, d?.full_name ?? "the resident", row?.signed_on ?? istToday())), signature: s ?? null };
}

export async function policeForm(sql: Sql, inviteId: string, userId: string) {
  const { role, inv } = await access(sql, inviteId, userId);
  if (role !== "owner") throw new Error("Only the owner downloads the police form.");
  const d = await details(sql, inviteId);
  if (!d) throw new Error("The resident hasn't filled in their details yet.");
  return policeFormLines({
    details: {
      fullName: d.full_name, phone: d.phone, email: d.email, dateOfBirth: d.date_of_birth, occupation: d.occupation, employer: d.employer,
      homeAddress: d.home_address, homeCity: d.home_city, homeState: d.home_state, homePincode: d.home_pincode,
      emergencyName: d.emergency_name, emergencyPhone: d.emergency_phone, idType: d.id_type as IdType, idMasked: maskId(d.id_type, d.id_last4),
    },
    outsideMangaluru: Boolean(d.outside_mangaluru),
    owner: { name: inv.owner_name, phone: inv.owner_phone ?? "", address: inv.address },
    propertyAddress: `${inv.title}, ${inv.address}`,
    startDate: inv.start_date,
  });
}

// ---------- Deposits ----------
type DepositRow = { id: string; invite_id: string; owner_id: string; tenant_id: string | null; amount_inr: number; received_on: string; checkout_on: string | null; refund_due_on: string | null; status: string; refunded_inr: number | null; refunded_on: string | null; refund_ref: string; tenant_ack_at: string | null };
const DEP_COLS = `id, invite_id, owner_id, tenant_id, amount_inr, received_on::text as received_on, checkout_on::text as checkout_on, refund_due_on::text as refund_due_on, status, refunded_inr, refunded_on::text as refunded_on, refund_ref, tenant_ack_at::text as tenant_ack_at`;

async function depositFor(sql: Sql, depositId: string, userId: string) {
  const d = (await sql.query(`select ${DEP_COLS} from deposits where id = $1`, [depositId]))[0] as DepositRow | undefined;
  if (!d || (d.owner_id !== userId && d.tenant_id !== userId)) throw new Error("Deposit not found.");
  return { d, role: (d.owner_id === userId ? "owner" : "tenant") as Role };
}

export async function recordDeposit(sql: Sql, inviteId: string, userId: string, amountInr: number, receivedOn: string) {
  const { role, inv } = await access(sql, inviteId, userId);
  if (role !== "owner") throw new Error("Only the owner records the deposit.");
  const id = crypto.randomUUID();
  await sql`insert into deposits (id, invite_id, owner_id, tenant_id, amount_inr, received_on) values (${id}, ${inviteId}, ${userId}, ${inv.tenant_id}, ${amountInr}, ${receivedOn}::date)
    on conflict (invite_id) do update set amount_inr = excluded.amount_inr, received_on = excluded.received_on, tenant_id = excluded.tenant_id, tenant_ack_at = null, updated_at = now()`;
}

async function deductions(sql: Sql, depositId: string) {
  return sql<{ id: string; amount_inr: number; reason: string; has_photo: boolean; tenant_ack_at: string | null; created_at: string }>`
    select id, amount_inr, reason, photo_base64 is not null as has_photo, tenant_ack_at::text as tenant_ack_at, created_at::text as created_at
    from deposit_deductions where deposit_id = ${depositId} order by created_at`;
}

export async function addDeduction(sql: Sql, depositId: string, userId: string, amountInr: number, reason: string, photo: string | null) {
  const { d, role } = await depositFor(sql, depositId, userId);
  if (role !== "owner") throw new Error("Only the owner adds deductions.");
  if (d.status === "REFUNDED") throw new Error("This deposit is already refunded.");
  const left = depositBalance(Number(d.amount_inr), await deductions(sql, depositId));
  if (amountInr > left) throw new Error(`Only ₹${left} of the deposit is left to deduct.`);
  await sql`insert into deposit_deductions (id, deposit_id, amount_inr, reason, photo_base64) values (${crypto.randomUUID()}, ${depositId}, ${amountInr}, ${reason}, ${photo})`;
}

export async function deductionPhoto(sql: Sql, deductionId: string, userId: string) {
  const r = (await sql<{ deposit_id: string; photo_base64: string | null }>`select deposit_id, photo_base64 from deposit_deductions where id = ${deductionId}`)[0];
  if (!r) throw new Error("Not found.");
  await depositFor(sql, r.deposit_id, userId);
  return r.photo_base64 ? `data:image/jpeg;base64,${r.photo_base64}` : null;
}

/** Tenant acknowledges the deposit amount and every deduction so far. */
export async function ackDeposit(sql: Sql, depositId: string, userId: string) {
  const { role } = await depositFor(sql, depositId, userId);
  if (role !== "tenant") throw new Error("Only the resident acknowledges.");
  await sql`update deposits set tenant_ack_at = coalesce(tenant_ack_at, now()), updated_at = now() where id = ${depositId}`;
  await sql`update deposit_deductions set tenant_ack_at = now() where deposit_id = ${depositId} and tenant_ack_at is null`;
}

export async function setCheckout(sql: Sql, depositId: string, userId: string, checkoutOn: string) {
  const { d, role } = await depositFor(sql, depositId, userId);
  if (role !== "owner") throw new Error("Only the owner sets the checkout date.");
  if (d.status === "REFUNDED") throw new Error("Already refunded.");
  const due = refundDueOn(checkoutOn);
  await sql`update deposits set checkout_on = ${checkoutOn}::date, refund_due_on = ${due}::date, status = 'REFUND_DUE', updated_at = now() where id = ${depositId}`;
  return due;
}

export async function markRefunded(sql: Sql, depositId: string, userId: string, refundedInr: number, refundedOn: string, ref: string) {
  const { d, role } = await depositFor(sql, depositId, userId);
  if (role !== "owner") throw new Error("Only the owner marks the refund.");
  const left = depositBalance(Number(d.amount_inr), await deductions(sql, depositId));
  if (refundedInr !== left) throw new Error(`Refund should be ₹${left} (deposit minus deductions).`);
  await sql`update deposits set status = 'REFUNDED', refunded_inr = ${refundedInr}, refunded_on = ${refundedOn}::date, refund_ref = ${ref}, updated_at = now() where id = ${depositId}`;
}

export async function listMoveIns(sql: Sql, userId: string) {
  const invites = (await sql.query(`select ${INVITE_COLS}, d.full_name as tenant_name, d.outside_mangaluru, d.id_type, d.id_last4, (to_char(s.signed_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') || ' IST') as signed_at
    ${INVITE_FROM} left join movein_details d on d.invite_id = i.id left join movein_signatures s on s.invite_id = i.id
    where (i.owner_id = $1 or i.tenant_id = $1) and i.status <> 'CANCELLED' order by i.created_at desc limit 50`, [userId])) as (InviteRow & {
    tenant_name: string | null; outside_mangaluru: boolean | null; id_type: string | null; id_last4: string | null; signed_at: string | null;
  })[];
  const out = [];
  for (const i of invites) {
    const dep = (await sql.query(`select ${DEP_COLS} from deposits where invite_id = $1`, [i.id]))[0] as DepositRow | undefined;
    const ded = dep ? await deductions(sql, dep.id) : [];
    out.push({
      id: i.id,
      token: i.token,
      role: (i.owner_id === userId ? "owner" : "tenant") as Role,
      title: i.title,
      bedLabel: i.bed_label,
      rentInr: Number(i.rent_inr),
      depositInr: Number(i.deposit_inr),
      startDate: i.start_date,
      status: i.status,
      ownerName: i.owner_name,
      tenantName: i.tenant_name,
      outsideMangaluru: i.outside_mangaluru == null ? null : Boolean(i.outside_mangaluru),
      idMasked: i.id_type && i.id_last4 ? maskId(i.id_type, i.id_last4) : null,
      signedAt: i.signed_at,
      deposit: dep
        ? {
            id: dep.id,
            amountInr: Number(dep.amount_inr),
            receivedOn: dep.received_on,
            checkoutOn: dep.checkout_on,
            refundDueOn: dep.refund_due_on,
            status: dep.status,
            refundedInr: dep.refunded_inr == null ? null : Number(dep.refunded_inr),
            refundedOn: dep.refunded_on,
            refundRef: dep.refund_ref,
            tenantAckAt: dep.tenant_ack_at,
            balanceInr: depositBalance(Number(dep.amount_inr), ded),
            deductions: ded.map((x) => ({ id: x.id, amountInr: Number(x.amount_inr), reason: x.reason, hasPhoto: Boolean(x.has_photo), tenantAckAt: x.tenant_ack_at, createdAt: x.created_at })),
          }
        : null,
    });
  }
  return out;
}
