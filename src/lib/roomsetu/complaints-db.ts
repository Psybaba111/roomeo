import type { Sql } from "../db.ts";
import { avgFixHours, canMove, normalizePan, receiptNo, type Category, type Receipt, type Status } from "./complaints.ts";

type Row = { id: string; listing_id: string; tenant_id: string; owner_id: string; category: Category; description: string; has_photo: boolean; status: Status; owner_note: string; created_at: string; started_at: string | null; fixed_at: string | null; confirmed_at: string | null; rating: number | null; rating_note: string; title: string; tenant_name: string; created_label: string; fixed_label: string | null };
const COLS = `c.id, c.listing_id, c.tenant_id, c.owner_id, c.category, c.description, c.photo_base64 is not null as has_photo, c.status, c.owner_note,
  c.created_at::text as created_at, c.started_at::text as started_at, c.fixed_at::text as fixed_at, c.confirmed_at::text as confirmed_at, to_char(c.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') || ' IST' as created_label, to_char(c.fixed_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') || ' IST' as fixed_label, c.rating, c.rating_note,
  l.title, coalesce(p.full_name, 'Resident') as tenant_name`;
const FROM = `from complaints c join listings l on l.id = c.listing_id left join profiles p on p.user_id = c.tenant_id`;

/** Listings the user has a confirmed move-in at (where they can raise complaints). */
export async function tenancies(sql: Sql, userId: string) {
  return sql<{ listing_id: string; owner_id: string; title: string }>`select distinct mi.listing_id, mi.owner_id, l.title from move_ins mi join listings l on l.id = mi.listing_id
    where mi.seeker_id = ${userId} and mi.confirmed_at is not null`;
}

export async function raiseComplaint(sql: Sql, tenantId: string, d: { listingId: string; category: Category; description: string; photo: string | null }) {
  const t = (await tenancies(sql, tenantId)).find((x) => x.listing_id === d.listingId);
  if (!t) throw new Error("You can raise complaints for the PG you've moved into.");
  const id = crypto.randomUUID();
  await sql`insert into complaints (id, listing_id, tenant_id, owner_id, category, description, photo_base64) values (${id}, ${d.listingId}, ${tenantId}, ${t.owner_id}, ${d.category}, ${d.description}, ${d.photo})`;
  await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${t.owner_id}, 'complaint', 'New complaint 🔧', ${d.description.slice(0, 120)}, '/dashboard#complaints')`;
  return id;
}

async function one(sql: Sql, id: string, userId: string) {
  const r = (await sql.query(`select ${COLS} ${FROM} where c.id = $1`, [id]))[0] as Row | undefined;
  if (!r || (r.owner_id !== userId && r.tenant_id !== userId)) throw new Error("Complaint not found.");
  return { r, role: (r.owner_id === userId ? "owner" : "tenant") as "owner" | "tenant" };
}

export async function moveComplaint(sql: Sql, id: string, userId: string, to: Status, note: string) {
  const { r, role } = await one(sql, id, userId);
  if (!canMove(role, r.status, to)) throw new Error("That status change isn't allowed.");
  if (to === "IN_PROGRESS") await sql`update complaints set status = 'IN_PROGRESS', started_at = now(), owner_note = ${note || r.owner_note}, updated_at = now() where id = ${id}`;
  else if (to === "FIXED") await sql`update complaints set status = 'FIXED', started_at = coalesce(started_at, now()), fixed_at = now(), owner_note = ${note || r.owner_note}, updated_at = now() where id = ${id}`;
  else if (to === "OPEN") await sql`update complaints set status = 'OPEN', fixed_at = null, rating_note = ${note}, updated_at = now() where id = ${id}`;
  if (to === "FIXED") await sql`insert into notifications (id, user_id, kind, title, body, href) values (${crypto.randomUUID()}, ${r.tenant_id}, 'complaint', 'Marked fixed ✅', 'Check it and confirm + rate.', '/dashboard#complaints')`;
}

export async function confirmComplaint(sql: Sql, id: string, userId: string, rating: number, note: string) {
  const { r, role } = await one(sql, id, userId);
  if (role !== "tenant" || !canMove("tenant", r.status, "CLOSED")) throw new Error("You can confirm once the owner marks it fixed.");
  await sql`update complaints set status = 'CLOSED', confirmed_at = now(), rating = ${rating}, rating_note = ${note}, updated_at = now() where id = ${id}`;
}

export async function complaintPhoto(sql: Sql, id: string, userId: string) {
  await one(sql, id, userId);
  const p = (await sql<{ photo_base64: string | null }>`select photo_base64 from complaints where id = ${id}`)[0];
  return p?.photo_base64 ? `data:image/jpeg;base64,${p.photo_base64}` : null;
}

const shape = (r: Row) => ({
  id: r.id, title: r.title, tenantName: r.tenant_name, category: r.category, description: r.description, hasPhoto: Boolean(r.has_photo), status: r.status,
  ownerNote: r.owner_note, createdAt: r.created_label, fixedAt: r.fixed_label, rating: r.rating == null ? null : Number(r.rating), ratingNote: r.rating_note,
});

export async function listComplaints(sql: Sql, userId: string) {
  const mine = (await sql.query(`select ${COLS} ${FROM} where c.tenant_id = $1 order by c.created_at desc limit 50`, [userId])) as Row[];
  const owned = (await sql.query(`select ${COLS} ${FROM} where c.owner_id = $1 order by (c.status in ('FIXED','CLOSED')), c.created_at desc limit 100`, [userId])) as Row[];
  const rated = owned.filter((r) => r.rating != null);
  return {
    mine: mine.map(shape),
    owned: owned.map(shape),
    ownerStats: owned.length
      ? { open: owned.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS").length, avgFixHours: avgFixHours(owned), avgRating: rated.length ? Math.round((rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length) * 10) / 10 : null }
      : null,
    tenancies: await tenancies(sql, userId),
  };
}

// ---------- Receipts ----------
export async function hasRentEntries(sql: Sql): Promise<boolean> {
  const r = (await sql<{ t: string | null }>`select to_regclass('public.rent_entries')::text as t`)[0];
  return Boolean(r?.t);
}

export async function markRentPaid(sql: Sql, ownerId: string, d: { moveInId: string; month: string; amountInr: number; paidOn: string; method: string; ref: string }) {
  const mi = (await sql<{ listing_id: string; seeker_id: string; owner_id: string }>`select listing_id, seeker_id, owner_id from move_ins where id = ${d.moveInId} and confirmed_at is not null`)[0];
  if (!mi || mi.owner_id !== ownerId) throw new Error("Only the owner can mark rent paid for this resident.");
  await sql`insert into rent_receipts_manual (id, move_in_id, listing_id, owner_id, tenant_id, month, amount_inr, paid_on, method, ref)
    values (${crypto.randomUUID()}, ${d.moveInId}, ${mi.listing_id}, ${ownerId}, ${mi.seeker_id}, ${d.month}, ${d.amountInr}, ${d.paidOn}::date, ${d.method}, ${d.ref})
    on conflict (move_in_id, month) do update set amount_inr = excluded.amount_inr, paid_on = excluded.paid_on, method = excluded.method, ref = excluded.ref`;
}

export async function saveReceiptProfile(sql: Sql, ownerId: string, d: { landlordName: string; pan: string; address: string }) {
  const pan = normalizePan(d.pan);
  await sql`insert into owner_receipt_profiles (owner_id, landlord_name, pan, address) values (${ownerId}, ${d.landlordName}, ${pan}, ${d.address})
    on conflict (owner_id) do update set landlord_name = excluded.landlord_name, pan = excluded.pan, address = excluded.address, updated_at = now()`;
}

type RcptRow = { key: string; id: string; month: string; amount_inr: number; paid_on: string; method: string; ref: string; owner_id: string; tenant_id: string; listing_id: string; source: "autopay" | "manual" };

async function receiptRows(sql: Sql, userId: string): Promise<RcptRow[]> {
  const manual = await sql<RcptRow>`select 'm:' || id as key, id, month, amount_inr, paid_on::text as paid_on, method, ref, owner_id, tenant_id, listing_id, 'manual' as source
    from rent_receipts_manual where tenant_id = ${userId} or owner_id = ${userId}`;
  let auto: RcptRow[] = [];
  if (await hasRentEntries(sql)) {
    auto = (await sql.query(`select 'a:' || e.id as key, e.id, e.month, e.amount_inr, (e.paid_at at time zone 'Asia/Kolkata')::date::text as paid_on, 'UPI' as method,
        coalesce(e.cf_payment_id, e.provider_ref, '') as ref, p.owner_id, p.renter_id as tenant_id, p.listing_id, 'autopay' as source
      from rent_entries e join rent_plans p on p.id = e.plan_id where e.status = 'PAID' and (p.renter_id = $1 or p.owner_id = $1)`, [userId])) as RcptRow[];
  }
  // One receipt per tenant+listing+month: AutoPay wins over a manual mark.
  const seen = new Set(auto.map((r) => `${r.tenant_id}|${r.listing_id}|${r.month}`));
  return [...auto, ...manual.filter((r) => !seen.has(`${r.tenant_id}|${r.listing_id}|${r.month}`))].sort((a, b) => b.month.localeCompare(a.month));
}

export async function listReceipts(sql: Sql, userId: string) {
  const rows = await receiptRows(sql, userId);
  const residents = await sql<{ id: string; title: string; tenant: string; rent: number }>`select mi.id, l.title, coalesce(p.full_name, 'Resident') as tenant, l.monthly_rent as rent
    from move_ins mi join listings l on l.id = mi.listing_id left join profiles p on p.user_id = mi.seeker_id where mi.owner_id = ${userId} and mi.confirmed_at is not null order by mi.confirmed_at desc limit 50`;
  const profile = (await sql<{ landlord_name: string; pan: string; address: string }>`select landlord_name, pan, address from owner_receipt_profiles where owner_id = ${userId}`)[0] ?? null;
  return {
    receipts: rows.map((r) => ({ key: r.key, month: r.month, amountInr: Number(r.amount_inr), paidOn: r.paid_on, source: r.source, role: r.owner_id === userId ? "owner" : "tenant" })),
    residents: residents.map((r) => ({ ...r, rent: Number(r.rent) })),
    profile: profile ? { landlordName: profile.landlord_name, pan: profile.pan, address: profile.address } : null,
  };
}

export async function receiptFor(sql: Sql, key: string, userId: string): Promise<Receipt> {
  const r = (await receiptRows(sql, userId)).find((x) => x.key === key);
  if (!r) throw new Error("Receipt not found.");
  const info = (await sql<{ tenant: string; owner: string; title: string; address: string | null; locality: string; city: string }>`
    select coalesce(tp.full_name, 'Resident') as tenant, coalesce(op.full_name, 'Owner') as owner, l.title, pr.address, l.locality_name as locality, l.city_name as city
    from listings l left join properties pr on pr.id = l.property_id left join profiles tp on tp.user_id = ${r.tenant_id} left join profiles op on op.user_id = ${r.owner_id}
    where l.id = ${r.listing_id}`)[0];
  const prof = (await sql<{ landlord_name: string; pan: string; address: string }>`select landlord_name, pan, address from owner_receipt_profiles where owner_id = ${r.owner_id}`)[0];
  const propertyAddress = `${info?.title ?? "PG"}, ${info?.address ?? `${info?.locality ?? ""}, ${info?.city ?? ""}`}`;
  return {
    receiptNo: receiptNo(r.id, r.month),
    month: r.month,
    amountInr: Number(r.amount_inr),
    paidOn: r.paid_on,
    method: r.method,
    ref: r.ref,
    tenantName: info?.tenant ?? "Resident",
    landlordName: prof?.landlord_name || info?.owner || "Owner",
    landlordPan: prof?.pan ?? "",
    landlordAddress: prof?.address || propertyAddress,
    propertyAddress,
    source: r.source,
  };
}
