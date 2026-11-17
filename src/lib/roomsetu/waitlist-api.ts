import { createServerFn } from "@tanstack/react-start";
import { cleanUtm } from "@/lib/analytics/utm";
import { saveUtm } from "@/lib/analytics/utm-db";
import { redirect } from "@tanstack/react-router";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { waitlistAllows, waitlistModeOn, validateWaitlist, WaitlistError } from "@/lib/roomsetu/waitlist";
import { joinWaitlist as joinDb, listWaitlist } from "@/lib/roomsetu/waitlist-db";
import { logEvent } from "@/lib/roomsetu/services";

const modeOn = () => waitlistModeOn(process.env);

/** Public: is pre-launch waitlist mode on in this environment? */
export const getWaitlistMode = createServerFn({ method: "GET" }).handler(async () => ({ enabled: modeOn() }));

/** Server-side gate for /search and /listing/$id. Flag off ⇒ returns immediately (no session lookup, no DB). */
export const waitlistGateCheck = createServerFn({ method: "GET" })
  .validator((page: unknown) => (page === "listing" ? "listing" : "search"))
  .handler(async ({ data: page }) => {
    if (!modeOn()) return { blocked: false };
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser().catch(() => null);
    let isAdmin = false;
    if (user) {
      const sql = await getSql();
      const roles = await sql<{ role: string }>`select role from profile_roles where user_id = ${user.id}`;
      isAdmin = roles.some((r) => r.role === "ADMIN" || r.role === "SUPER_ADMIN");
    }
    return { blocked: !waitlistAllows(page, { signedIn: Boolean(user), isAdmin }) };
  });

/** `beforeLoad` for browse routes: in waitlist mode, signed-out visitors go to the waitlist instead. */
export async function waitlistBeforeLoad(page: "search" | "listing") {
  const { blocked } = await waitlistGateCheck({ data: page });
  if (blocked) throw redirect({ to: "/waitlist" });
}

export const joinWaitlist = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    if (!modeOn()) throw new Error("The waitlist isn't open.");
    let w;
    try {
      w = validateWaitlist(data);
    } catch (e) {
      if (e instanceof WaitlistError) throw new Error(e.message);
      throw e;
    }
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser().catch(() => null);
    const sql = await getSql();
    const r = await joinDb(sql, w, user?.id ?? null);
    if (r.status === "joined") await saveUtm(sql, "waitlist_signups", r.id, cleanUtm((data as { utm?: unknown } | null)?.utm));
    logEvent("waitlist.join", { status: r.status, role: w.role, source: w.source, hasType: Boolean(w.roomieType) });
    return { status: r.status };
  });

/** Operator list (+ CSV built client-side). Works with the flag on or off. */
export const adminWaitlist = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const { assertAdmin } = await import("@/lib/roomsetu/admin-api");
    await assertAdmin(sql, context.userId);
    return { enabled: modeOn(), ...(await listWaitlist(sql)) };
  });
