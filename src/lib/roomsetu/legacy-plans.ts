/**
 * The old subscription_plans checkout (₹199/₹299/₹499) is retired. Every code that
 * reaches it is refused with 410 Gone. Rows stay in the DB so purchase history reads fine.
 * Current passes (WEEKLY/MONTHLY/SQUAD), boost and fast-track use pricing-api.
 */
export function legacyPlanRejection(_code: unknown): { status: 410; message: string } {
  return { status: 410, message: "That plan is retired. Grab the weekly or monthly pass on the Dashboard instead." };
}
