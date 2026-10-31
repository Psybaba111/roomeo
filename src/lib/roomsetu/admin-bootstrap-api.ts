import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { claimFirstAdmin, type Query } from "@/lib/roomsetu/admin-bootstrap";

/** Whether the first-run claim screen should be offered at all. Reveals nothing else. */
export const adminBootstrapOpen = createServerFn({ method: "GET" }).handler(async () => {
  return { open: (process.env.ADMIN_BOOTSTRAP_TOKEN ?? "").trim().length >= 24 };
});

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const t = (input as { token?: unknown } | null)?.token;
    return { token: typeof t === "string" ? t.slice(0, 200) : "" };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const q: Query = (text, params) => sql.query<Record<string, unknown>>(text, params ?? []);
    return claimFirstAdmin(q, { configuredToken: process.env.ADMIN_BOOTSTRAP_TOKEN, givenToken: data.token, userId: context.userId });
  });
