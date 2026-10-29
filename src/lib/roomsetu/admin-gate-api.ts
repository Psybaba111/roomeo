import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { adminRedirect, rolesAreAdmin } from "@/lib/roomsetu/admin-gate";

/** Server-side check for /admin/* routes. Never throws; returns where to send the visitor. */
export const adminGateCheck = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser().catch(() => null);
  if (!user) return { to: adminRedirect({ signedIn: false, isAdmin: false }) };
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const profile = await sql<{ account_status: string }>`select account_status from profiles where user_id = ${user.id}`;
  const roles = await sql<{ role: string }>`select role from profile_roles where user_id = ${user.id}`;
  const isAdmin = rolesAreAdmin(roles.map((r) => String(r.role)), String(profile[0]?.account_status ?? ""));
  return { to: adminRedirect({ signedIn: true, isAdmin }) };
});

/** Use as `beforeLoad` on every /admin/* route. */
export async function adminBeforeLoad() {
  const { to } = await adminGateCheck();
  if (to) throw redirect({ to });
}
