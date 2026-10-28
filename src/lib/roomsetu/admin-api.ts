import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { bool, num, str } from "@/lib/roomsetu/map";
import { notifyWhatsApp } from "@/lib/roomsetu/mappstore";
import { unlockFromPayment } from "@/lib/roomsetu/squad-api";

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

export async function assertAdmin(sql: Sql, userId: string) {
  const profile = await sql<{
    account_status: string;
  }>`select account_status from profiles where user_id = ${userId}`;
  if (str(profile[0]?.account_status) === "SUSPENDED")
    throw new Error("This account is suspended.");
  const roles = await sql<{
    role: string;
  }>`select role from profile_roles where user_id = ${userId}`;
  const names = roles.map((r) => r.role);
  if (!names.includes("ADMIN") && !names.includes("SUPER_ADMIN")) {
    throw new Error("Operator access only.");
  }
  return names;
}

export async function audit(
  sql: Sql,
  actor: string,
  action: string,
  targetType: string,
  targetId: string,
  detail: string,
) {
  await sql`insert into audit_log (id, actor_id, action, target_type, target_id, detail) values (${crypto.randomUUID()}, ${actor}, ${action}, ${targetType}, ${targetId}, ${detail})`;
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const k = await sql.query<Record<string, unknown>>(`select
      (select count(*)::int from profiles) as users,
      (select count(*)::int from profiles where created_at > now() - interval '7 days') as new_users,
      (select count(*)::int from profiles where last_seen > now() - interval '7 days') as active_users,
      (select count(*)::int from listings where status <> 'REMOVED') as listings,
      (select count(*)::int from listings where status = 'ACTIVE') as active_listings,
      (select count(*)::int from listings where status = 'ACTIVE') as rooms_available,
      (select count(*)::int from listings where status = 'OCCUPIED') as rooms_occupied,
      (select count(*)::int from room_wanted where status = 'ACTIVE') as room_wanted,
      (select count(*)::int from profiles where verification_status = 'VERIFIED') as verified_hosts,
      (select count(*)::int from trust_checks where status = 'PENDING') as pending_verification,
      (select count(*)::int from applications) as applications,
      (select count(*)::int from applications where status = 'ACCEPTED') as accepted,
      (select count(*)::int from conversations) as conversations,
      (select count(*)::int from messages) as messages,
      (select count(*)::int from matches) as matches,
      (select count(*)::int from reports where status in ('OPEN','REVIEWING')) as open_reports,
      (select count(*)::int from reports) as reports,
      (select count(*)::int from profiles where account_status = 'SUSPENDED') as suspensions,
      (select count(*)::int from listings where possible_duplicate = true) as duplicates,
      (select count(*)::int from reports where fraud_flag = true) as fraud_flags,
      (select coalesce(sum(l.monthly_rent),0)::int from applications a join listings l on l.id = a.listing_id where a.status = 'ACCEPTED') as indicated_gmv,
      (select coalesce(sum(amount_inr),0)::int from payments where status = 'CAPTURED') as revenue,
      (select count(*)::int from listings where listing_tier <> 'FREE' and status = 'ACTIVE') as paid_listings,
      (select count(*)::int from metric_events where kind = 'search') as searches,
      (select count(*)::int from profiles where is_demo = false) as real_users,
      (select round(avg(monthly_rent))::int from listings where status = 'ACTIVE') as avg_rent,
      (select round(avg(deposit))::int from listings where status = 'ACTIVE') as avg_deposit
    `);
    const row = k[0] ?? {};
    const apps = num(row.applications);
    const accepted = num(row.accepted);
    const listings = num(row.active_listings);
    const convos = num(row.conversations);
    const bothSides = await sql<{ n: number }>`
      select count(*)::int as n from conversations c
      where (select count(distinct sender_id) from messages m where m.conversation_id = c.id) >= 2`;
    const weeks = await sql.query<Record<string, unknown>>(`
      select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, count(*)::int as n
      from listings group by 1 order by 1`);
    const userWeeks = await sql.query<Record<string, unknown>>(`
      select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, count(*)::int as n
      from profiles group by 1 order by 1`);
    const enquiryWeeks = await sql.query<Record<string, unknown>>(`
      select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, count(*)::int as n
      from applications group by 1 order by 1`);
    const cities = await sql.query<Record<string, unknown>>(`
      select city_name as city, count(*)::int as rooms from listings where status = 'ACTIVE' group by 1 order by rooms desc`);
    const weekMap = new Map<
      string,
      { week: string; listings: number; users: number; enquiries: number }
    >();
    for (const w of weeks) {
      const key = str(w.week);
      weekMap.set(key, { week: key, listings: num(w.n), users: 0, enquiries: 0 });
    }
    for (const w of userWeeks) {
      const key = str(w.week);
      const cur = weekMap.get(key) ?? { week: key, listings: 0, users: 0, enquiries: 0 };
      cur.users = num(w.n);
      weekMap.set(key, cur);
    }
    for (const w of enquiryWeeks) {
      const key = str(w.week);
      const cur = weekMap.get(key) ?? { week: key, listings: 0, users: 0, enquiries: 0 };
      cur.enquiries = num(w.n);
      weekMap.set(key, cur);
    }
    return {
      users: num(row.users),
      newUsers: num(row.new_users),
      activeUsers: num(row.active_users),
      listings: num(row.listings),
      activeListings: listings,
      roomsAvailable: num(row.rooms_available),
      roomsOccupied: num(row.rooms_occupied),
      roomWanted: num(row.room_wanted),
      verifiedHosts: num(row.verified_hosts),
      pendingVerification: num(row.pending_verification),
      applications: apps,
      accepted,
      conversations: convos,
      messages: num(row.messages),
      matches: num(row.matches),
      openReports: num(row.open_reports),
      reports: num(row.reports),
      suspensions: num(row.suspensions),
      duplicates: num(row.duplicates),
      fraudFlags: num(row.fraud_flags),
      indicatedGmv: num(row.indicated_gmv),
      revenue: num(row.revenue),
      paidListings: num(row.paid_listings),
      searches: num(row.searches),
      realUsers: num(row.real_users),
      avgRent: num(row.avg_rent),
      avgDeposit: num(row.avg_deposit),
      conversion: apps ? Math.round((accepted / apps) * 100) : 0,
      enquiryRate: listings ? Math.round((convos / listings) * 100) : 0,
      responseRate: convos ? Math.round((num(bothSides[0]?.n) / convos) * 100) : 0,
      series: [...weekMap.values()].sort((a, b) => a.week.localeCompare(b.week)),
      cities: cities.map((c) => ({ city: str(c.city), rooms: num(c.rooms) })),
    };
  });

export const adminUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select p.user_id, p.full_name, p.city, p.occupation, p.intent, p.account_status, p.verification_status,
              p.is_demo, p.mobile, to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD') as joined,
              coalesce(string_agg(r.role, ','), '') as roles
       from profiles p
       left join profile_roles r on r.user_id = p.user_id
       group by p.user_id
       order by p.is_demo asc, p.created_at desc
       limit 80`,
    );
    return rows.map((r) => ({
      id: str(r.user_id),
      name: str(r.full_name),
      city: str(r.city),
      occupation: str(r.occupation),
      intent: str(r.intent),
      status: str(r.account_status),
      verification: str(r.verification_status),
      isDemo: bool(r.is_demo),
      mobile: str(r.mobile),
      joined: str(r.joined),
      roles: str(r.roles),
    }));
  });

export const adminSetUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const id = str(o.id).slice(0, 80);
    const action = str(o.action);
    if (!id) throw new Error("Unknown person.");
    if (!["suspend", "restore", "verify", "unverify"].includes(action))
      throw new Error("Unknown action.");
    return { id, action };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const actorRoles = await assertAdmin(sql, context.userId);
    if (data.id === context.userId) throw new Error("You cannot change your own account.");
    const target = await sql`select user_id from profiles where user_id = ${data.id}`;
    if (!target.length) throw new Error("That person was not found.");
    const targetRoles = (
      await sql<{ role: string }>`select role from profile_roles where user_id = ${data.id}`
    ).map((r) => r.role);
    if (
      (targetRoles.includes("SUPER_ADMIN") || targetRoles.includes("ADMIN")) &&
      !actorRoles.includes("SUPER_ADMIN")
    ) {
      throw new Error("Only a super admin can change an operator.");
    }
    if (data.action === "suspend") {
      await sql`update profiles set account_status = 'SUSPENDED', updated_at = now() where user_id = ${data.id}`;
    } else if (data.action === "restore") {
      await sql`update profiles set account_status = 'ACTIVE', updated_at = now() where user_id = ${data.id}`;
    } else if (data.action === "verify") {
      await sql`update profiles set verification_status = 'VERIFIED', updated_at = now() where user_id = ${data.id}`;
    } else {
      await sql`update profiles set verification_status = 'REJECTED', updated_at = now() where user_id = ${data.id}`;
    }
    await audit(sql, context.userId, data.action, "user", data.id, "");
    return { ok: true };
  });

export const adminListings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select l.id, l.title, l.city_name, l.monthly_rent, l.status, l.verification_status, l.listing_tier,
              l.possible_duplicate, l.is_demo, l.quality_score, pr.full_name as host
       from listings l join profiles pr on pr.user_id = l.owner_id
       order by l.created_at desc limit 80`,
    );
    return rows.map((r) => ({
      id: str(r.id),
      title: str(r.title),
      city: str(r.city_name),
      rent: num(r.monthly_rent),
      status: str(r.status),
      verification: str(r.verification_status),
      tier: str(r.listing_tier),
      duplicate: bool(r.possible_duplicate),
      isDemo: bool(r.is_demo),
      quality: num(r.quality_score),
      host: str(r.host),
    }));
  });

export const adminSetListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const id = str(o.id);
    const action = str(o.action);
    if (!/^[0-9a-f-]{8,80}$/i.test(id)) throw new Error("Unknown listing.");
    if (!["verify", "reject", "remove", "feature", "restore"].includes(action))
      throw new Error("Unknown action.");
    return { id, action };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const listing = await sql<{
      owner_id: string;
    }>`select owner_id from listings where id = ${data.id}`;
    if (!listing[0]) throw new Error("That listing was not found.");
    if (
      listing[0].owner_id === context.userId &&
      (data.action === "verify" || data.action === "feature")
    ) {
      throw new Error("Another operator has to review your listing.");
    }
    if (data.action === "verify") {
      await sql`update listings set verification_status = 'VERIFIED', updated_at = now() where id = ${data.id}`;
      await sql`update properties set verification_status = 'VERIFIED' where id = (select property_id from listings where id = ${data.id})`;
    } else if (data.action === "reject") {
      await sql`update listings set verification_status = 'REJECTED', updated_at = now() where id = ${data.id}`;
    } else if (data.action === "remove") {
      await sql`update listings set status = 'REMOVED', updated_at = now() where id = ${data.id}`;
    } else if (data.action === "feature") {
      await sql`update listings set listing_tier = 'FEATURED', updated_at = now() where id = ${data.id}`;
    } else {
      await sql`update listings set status = 'ACTIVE', verification_status = 'PENDING', updated_at = now() where id = ${data.id}`;
    }
    await audit(sql, context.userId, data.action, "listing", data.id, "");
    return { ok: true };
  });

export const adminVerifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const checks = await sql.query<Record<string, unknown>>(
      `select t.id, t.kind, t.status, t.note, t.user_id, p.full_name, p.is_demo
       from trust_checks t join profiles p on p.user_id = t.user_id
       where t.status = 'PENDING' order by t.created_at asc limit 40`,
    );
    return checks.map((c) => ({
      id: str(c.id),
      kind: str(c.kind),
      status: str(c.status),
      note: str(c.note),
      userId: str(c.user_id),
      name: str(c.full_name),
      isDemo: bool(c.is_demo),
    }));
  });

async function closeIdentityThreads(sql: Sql, userId: string) {
  const rows = await sql<{ id: string }>`
    select c.id from conversations c
    join conversation_members m on m.conversation_id = c.id and m.user_id = ${userId}
    where c.closed_at is null`;
  const body =
    "This thread is closed because an identity check failed a second time. Rent cannot be collected.";
  for (const row of rows) {
    await sql`update conversations set closed_at = now(), updated_at = now() where id = ${row.id}`;
    await sql`insert into messages (id, conversation_id, sender_id, body, kind) values (${crypto.randomUUID()}, ${row.id}, ${userId}, ${body}, 'SYSTEM')`;
  }
}

export const adminSetCheck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const status = str(o.status);
    if (status !== "VERIFIED" && status !== "REJECTED") throw new Error("Unknown decision.");
    const id = str(o.id);
    if (!/^[0-9a-f-]{8,80}$/i.test(id)) throw new Error("Unknown check.");
    return { id, status };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const actorRoles = await assertAdmin(sql, context.userId);
    const target = await sql<{
      user_id: string;
      kind: string;
      identity_attempts: number;
      identity_source: string;
    }>`
      select t.user_id, t.kind, p.identity_attempts, p.identity_source
      from trust_checks t join profiles p on p.user_id = t.user_id
      where t.id = ${data.id}`;
    const subject = target[0];
    if (!subject) throw new Error("That check was not found.");
    if (subject.user_id === context.userId) throw new Error("You cannot decide your own check.");
    const targetRoles = (
      await sql<{ role: string }>`select role from profile_roles where user_id = ${subject.user_id}`
    ).map((r) => r.role);
    if (
      (targetRoles.includes("SUPER_ADMIN") || targetRoles.includes("ADMIN")) &&
      !actorRoles.includes("SUPER_ADMIN")
    ) {
      throw new Error("Only a super admin can change an operator.");
    }
    if (subject.kind === "IDENTITY" && data.status === "VERIFIED") {
      if (subject.identity_source === "DIGILOCKER")
        throw new Error("DigiLocker already passed this. A desk pass is not a government check.");
      if (num(subject.identity_attempts) < 1)
        throw new Error("DigiLocker has to be tried before the desk can pass it.");
      await sql`update profiles set identity_status = 'VERIFIED', identity_source = 'STAFF', updated_at = now() where user_id = ${subject.user_id}`;
      await sql`update trust_checks set status = 'VERIFIED', note = 'Desk decision. Not a DigiLocker check.', updated_at = now() where id = ${data.id}`;
      await audit(
        sql,
        context.userId,
        "STAFF_PASS",
        "trust_check",
        data.id,
        "Not a government check.",
      );
      return { ok: true };
    }
    if (subject.kind === "IDENTITY" && data.status === "REJECTED") {
      await sql`update profiles set identity_status = 'FAILED', updated_at = now() where user_id = ${subject.user_id}`;
      await sql`update trust_checks set status = 'REJECTED', note = 'Desk rejected the identity check. Not recorded as a government result.', updated_at = now() where id = ${data.id}`;
      await closeIdentityThreads(sql, subject.user_id);
      await audit(
        sql,
        context.userId,
        "REJECTED",
        "trust_check",
        data.id,
        "Identity rejected by the desk.",
      );
      return { ok: true };
    }
    const rows = await sql<{
      user_id: string;
    }>`update trust_checks set status = ${data.status}, updated_at = now() where id = ${data.id} returning user_id`;
    const userId = rows[0]?.user_id;
    if (userId) {
      const pending = await sql<{
        n: number;
      }>`select count(*)::int as n from trust_checks where user_id = ${userId} and status = 'PENDING'`;
      const rejected = await sql<{
        n: number;
      }>`select count(*)::int as n from trust_checks where user_id = ${userId} and status = 'REJECTED'`;
      if (num(rejected[0]?.n) > 0) {
        await sql`update profiles set verification_status = 'REJECTED' where user_id = ${userId}`;
      } else if (num(pending[0]?.n) === 0) {
        await sql`update profiles set verification_status = 'VERIFIED' where user_id = ${userId}`;
      }
    }
    await audit(sql, context.userId, data.status, "trust_check", data.id, "");
    return { ok: true };
  });

export const adminReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select id, target_type, target_id, category, note, status, fraud_flag,
              to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as filed
       from reports order by created_at desc limit 40`,
    );
    return rows.map((r) => ({
      id: str(r.id),
      targetType: str(r.target_type),
      targetId: str(r.target_id),
      category: str(r.category),
      note: str(r.note),
      status: str(r.status),
      fraud: bool(r.fraud_flag),
      filed: str(r.filed),
    }));
  });

export const adminSetReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const status = str(o.status);
    if (!["REVIEWING", "RESOLVED", "DISMISSED"].includes(status))
      throw new Error("Unknown decision.");
    const id = str(o.id);
    if (!/^[0-9a-f-]{8,80}$/i.test(id)) throw new Error("Unknown report.");
    return { id, status };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    await sql`update reports set status = ${data.status}, updated_at = now() where id = ${data.id}`;
    await audit(sql, context.userId, data.status, "report", data.id, "");
    return { ok: true };
  });

export const adminAddCity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const o = asRecord(input);
    const name = str(o.name).trim().slice(0, 60);
    const state = str(o.state).trim().slice(0, 60);
    const lat = num(o.lat);
    const lng = num(o.lng);
    if (name.length < 2 || state.length < 2) throw new Error("City and state are required.");
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0))
      throw new Error("Add a real latitude and longitude.");
    return { name, state, lat, lng, locality: str(o.locality).trim().slice(0, 80) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const existing = await sql<{
      id: string;
    }>`select id from cities where lower(name) = lower(${data.name})`;
    const cityId = existing[0]?.id ?? crypto.randomUUID();
    if (!existing[0]) {
      await sql`insert into cities (id, name, state, lat, lng) values (${cityId}, ${data.name}, ${data.state}, ${data.lat}, ${data.lng})`;
    }
    if (data.locality) {
      await sql`insert into localities (id, city_id, name, lat, lng) values (${crypto.randomUUID()}, ${cityId}, ${data.locality}, ${data.lat}, ${data.lng}) on conflict (city_id, name) do nothing`;
    }
    await audit(sql, context.userId, "add_city", "city", cityId, data.name);
    return { ok: true };
  });

export const adminAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select action, target_type, target_id, detail, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as at
       from audit_log order by created_at desc limit 30`,
    );
    return rows.map((r) => ({
      action: str(r.action),
      targetType: str(r.target_type),
      targetId: str(r.target_id),
      detail: str(r.detail),
      at: str(r.at),
    }));
  });

export const adminConversations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select c.id, l.title, (select count(*)::int from messages m where m.conversation_id = c.id) as messages,
              to_char(c.updated_at at time zone 'UTC', 'YYYY-MM-DD') as updated
       from conversations c left join listings l on l.id = c.listing_id
       order by c.updated_at desc limit 20`,
    );
    return rows.map((r) => ({
      id: str(r.id),
      title: str(r.title) || "Room wanted thread",
      messages: num(r.messages),
      updated: str(r.updated),
    }));
  });

export const adminPayments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select p.id, p.ref, p.utr, p.amount_inr, p.status, p.purpose, p.submitted_at, coalesce(pr.full_name, p.user_id) as name
       from payments p left join profiles pr on pr.user_id = p.user_id
       where p.provider = 'UPI' and p.status in ('SUBMITTED','PAID','REJECTED')
       order by (p.status = 'SUBMITTED') desc, p.submitted_at desc nulls last limit 200`,
    );
    return rows.map((r) => ({
      id: str(r.id),
      ref: str(r.ref),
      utr: str(r.utr),
      amount: num(r.amount_inr),
      status: str(r.status),
      purpose: str(r.purpose),
      name: str(r.name),
      submittedAt: str(r.submitted_at),
    }));
  });

export const adminReviewPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = asRecord(input);
    const id = str(r.id);
    if (!/^[0-9a-f-]{8,80}$/i.test(id)) throw new Error("Unknown payment.");
    if (r.decision !== "APPROVE" && r.decision !== "REJECT")
      throw new Error("Pick approve or reject.");
    return { id, decision: r.decision as "APPROVE" | "REJECT" };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    if (data.decision === "REJECT") {
      // Rejected rows keep their UTR so it can't be reused; the user starts a fresh checkout.
      const rows =
        await sql`update payments set status = 'REJECTED', reviewed_by = ${context.userId}, reviewed_at = now()
        where id = ${data.id} and provider = 'UPI' and status = 'SUBMITTED' returning id`;
      if (!rows.length) throw new Error("Already reviewed.");
      await audit(sql, context.userId, "payment.reject", "payment", data.id, "");
      return { ok: true };
    }
    // Single statement = single transaction: mark PAID and activate the subscription atomically.
    const rows = await sql.query<{ id: string }>(
      `with paid as (
         update payments set status = 'PAID', reviewed_by = $2, reviewed_at = now()
         where id = $1 and provider = 'UPI' and status = 'SUBMITTED'
         returning id, user_id, plan_id
       ), sub as (
         insert into subscriptions (id, user_id, plan_id, status, payment_id, activated_at)
         select $3, user_id, plan_id, 'ACTIVE', id, now() from paid where plan_id is not null
         returning id
       ), logged as (
         insert into audit_log (id, actor_id, action, target_type, target_id, detail)
         select $4, $2, 'payment.approve', 'payment', id, 'subscription ' || $3 from paid
       )
       select id from paid`,
      [data.id, context.userId, crypto.randomUUID(), crypto.randomUUID()],
    );
    if (!rows.length) throw new Error("Already reviewed.");
    // Contact-fee payments unlock messaging with the owner (single seeker or whole squad).
    await unlockFromPayment(sql, data.id);
    const who = await sql<{
      phone_e164: string | null;
      purpose: string;
      amount_inr: number;
      ref: string;
    }>`
      select pr.phone_e164, p.purpose, p.amount_inr, p.ref from payments p join profiles pr on pr.user_id = p.user_id
      where p.id = ${data.id} and pr.phone_verified_at is not null`;
    if (who[0])
      await notifyWhatsApp("paymentApproved", who[0].phone_e164, [
        who[0].purpose,
        `₹${num(who[0].amount_inr)}`,
        who[0].ref,
      ]);
    return { ok: true };
  });
