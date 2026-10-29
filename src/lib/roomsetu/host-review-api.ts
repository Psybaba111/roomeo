import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { bool, str } from "@/lib/roomsetu/map";
import { assertAdmin, audit } from "@/lib/roomsetu/admin-api";
import {
  decisionBlocker,
  isSelfDecision,
  selfDecisionAudit,
  hostReviewMessage,
  parseHostDecision,
  parseIdSubmission,
} from "@/lib/roomsetu/host-review";
import { hitLimit } from "@/lib/roomsetu/rate-limit";

/** Host: current manual-review state and the message to show. */
export const getHostReview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<Record<string, unknown>>`
      select identity_status, identity_source, id_review_status, id_review_note, id_doc_type, id_doc_last4, id_name, id_submitted_at::text as submitted
      from profiles where user_id = ${context.userId}`;
    const r = rows[0] ?? {};
    const state = {
      identityStatus: str(r.identity_status),
      identitySource: str(r.identity_source),
      reviewStatus: str(r.id_review_status),
      note: str(r.id_review_note),
    };
    return {
      ...state,
      docType: str(r.id_doc_type),
      last4: str(r.id_doc_last4),
      nameOnId: str(r.id_name),
      submittedAt: str(r.submitted),
      message: hostReviewMessage(state),
    };
  });

/** Host: submit ID details for manual review. */
export const submitHostId = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseIdSubmission(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await hitLimit(sql, context.userId, "id_submit");
    const rows = await sql<{
      identity_status: string;
      account_status: string;
      id_review_status: string;
    }>`select identity_status, account_status, id_review_status from profiles where user_id = ${context.userId}`;
    const p = rows[0];
    if (!p) throw new Error("Finish your profile to continue.");
    if (p.account_status === "SUSPENDED") throw new Error("This account is suspended.");
    if (p.identity_status === "VERIFIED") throw new Error("Your ID is already verified.");
    if (p.id_review_status === "PENDING") throw new Error("Already submitted. The team is reviewing it.");
    await sql`update profiles set id_review_status = 'PENDING', id_doc_type = ${data.docType}, id_doc_last4 = ${data.last4}, id_name = ${data.nameOnId},
      id_submitted_at = now(), id_review_note = '', updated_at = now() where user_id = ${context.userId}`;
    await sql`insert into trust_checks (id, user_id, kind, status, note) values (${crypto.randomUUID()}, ${context.userId}, 'IDENTITY', 'PENDING', 'Submitted for manual ID review.')
      on conflict (user_id, kind) do update set status = 'PENDING', note = excluded.note, updated_at = now()`;
    await audit(sql, context.userId, "ID_SUBMITTED", "profile", context.userId, data.docType);
    return { ok: true };
  });

/** Admin: hosts whose ID is not verified, pending first. */
export const adminHostQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await assertAdmin(sql, context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select p.user_id, p.full_name, p.city, p.identity_status, p.identity_source, p.identity_attempts, p.id_review_status, p.id_doc_type, p.id_doc_last4, p.id_name, p.fast_track_at is not null as fast_track,
              p.id_submitted_at::text as submitted, p.id_review_note, p.approved_at::text as approved_at, p.phone_verified_at is not null as phone_ok, u.email,
              (select count(*)::int from listings l where l.owner_id = p.user_id and l.status <> 'REMOVED') as listings
       from profiles p left join "user" u on u.id = p.user_id
       where p.is_demo = false
         and (p.identity_status <> 'VERIFIED' or p.id_review_status <> '')
         and exists (select 1 from profile_roles r where r.user_id = p.user_id and r.role = 'HOST')
       order by case when p.id_review_status = 'PENDING' and p.fast_track_at is not null then 0 else 1 end, p.fast_track_at asc nulls last,
                case p.id_review_status when 'PENDING' then 0 when 'REJECTED' then 2 when 'APPROVED' then 3 else 1 end, p.id_submitted_at desc nulls last
       limit 100`,
    );
    return rows.map((r) => ({
      userId: str(r.user_id),
      name: str(r.full_name),
      email: str(r.email),
      city: str(r.city),
      identityStatus: str(r.identity_status),
      identitySource: str(r.identity_source),
      reviewStatus: str(r.id_review_status),
      docType: str(r.id_doc_type),
      last4: str(r.id_doc_last4),
      nameOnId: str(r.id_name),
      submittedAt: str(r.submitted),
      note: str(r.id_review_note),
      approvedAt: str(r.approved_at),
      phoneVerified: bool(r.phone_ok),
      listings: Number(r.listings ?? 0),
      fastTrack: bool(r.fast_track),
    }));
  });

/** Admin: approve or reject a host's ID. Approve sets the same fields DigiLocker would. */
export const adminDecideHost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseHostDecision(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const actorRoles = await assertAdmin(sql, context.userId);
    const rows = await sql<{
      identity_source: string;
      id_review_status: string;
    }>`select identity_source, id_review_status from profiles where user_id = ${data.userId}`;
    const t = rows[0];
    if (!t) throw new Error("Host not found.");
    const blocker = decisionBlocker({
      actorId: context.userId,
      targetId: data.userId,
      identitySource: t.identity_source,
      reviewStatus: t.id_review_status,
      decision: data.decision,
      actorRoles,
      reason: data.reason,
    });
    if (blocker) throw new Error(blocker);
    const targetRoles = (
      await sql<{ role: string }>`select role from profile_roles where user_id = ${data.userId}`
    ).map((r) => r.role);
    if (
      (targetRoles.includes("ADMIN") || targetRoles.includes("SUPER_ADMIN")) &&
      !actorRoles.includes("SUPER_ADMIN")
    )
      throw new Error("Only a super admin can change an operator.");
    if (data.decision === "APPROVE") {
      await sql`update profiles set identity_status = 'VERIFIED', identity_source = 'STAFF', verification_status = case when phone_verified_at is not null then 'VERIFIED' else 'UNVERIFIED' end, id_review_status = 'APPROVED', id_review_note = ${data.reason},
        approved_by = ${context.userId}, approved_at = now(), rejected_by = null, rejected_at = null, updated_at = now() where user_id = ${data.userId}`;
      await sql`insert into trust_checks (id, user_id, kind, status, note) values (${crypto.randomUUID()}, ${data.userId}, 'IDENTITY', 'VERIFIED', 'Approved by the roomeo team. Not a DigiLocker check.')
        on conflict (user_id, kind) do update set status = 'VERIFIED', note = excluded.note, updated_at = now()`;
      await audit(
        sql,
        context.userId,
        "HOST_ID_APPROVED",
        "profile",
        data.userId,
        data.reason || "Manual ID review",
      );
    } else {
      await sql`update profiles set id_review_status = 'REJECTED', id_review_note = ${data.reason}, rejected_by = ${context.userId}, rejected_at = now(),
        identity_status = case when identity_source = 'STAFF' then 'UNVERIFIED' else identity_status end,
        identity_source = case when identity_source = 'STAFF' then '' else identity_source end,
        verification_status = case when identity_source = 'STAFF' then 'UNVERIFIED' else verification_status end, updated_at = now() where user_id = ${data.userId}`;
      await sql`insert into trust_checks (id, user_id, kind, status, note) values (${crypto.randomUUID()}, ${data.userId}, 'IDENTITY', 'REJECTED', ${`Manual ID review rejected: ${data.reason}`})
        on conflict (user_id, kind) do update set status = 'REJECTED', note = excluded.note, updated_at = now()`;
      await audit(sql, context.userId, "HOST_ID_REJECTED", "profile", data.userId, data.reason);
    }
    if (isSelfDecision(context.userId, data.userId)) {
      const a = selfDecisionAudit(data.decision, data.reason);
      await audit(sql, context.userId, a.action, "profile", data.userId, a.detail);
    }
    return { ok: true };
  });
