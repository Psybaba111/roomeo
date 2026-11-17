import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { cleanUtm } from "@/lib/analytics/utm";
import { saveUtm } from "@/lib/analytics/utm-db";

/** Right after an email sign-up: store the visitor's first-touch utm_* on their account (first touch wins). */
export const saveSignupUtm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => cleanUtm(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return { result: await saveUtm(sql, "user", context.userId, data) };
  });
