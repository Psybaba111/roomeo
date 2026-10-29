/** The v2 passes shown in the Dashboard "Plans" box. Old ₹199/₹299/₹499 subscription_plans rows are never shown. */
export type DashboardPass =
  | { code: "WEEKLY" | "MONTHLY"; name: string; price: number; perks: string; action: "pay" }
  | { code: "SQUAD"; name: string; price: number; perks: string; action: "squad" };

export function dashboardPasses(p: { weekly: number; monthly: number; squadPerMember: number; squadDays: number; model: string }): DashboardPass[] {
  if (p.model !== "FREE_THEN_PASS") return [];
  return [
    { code: "WEEKLY", name: "Weekly pass", price: p.weekly, perks: "Message any owner for 7 days.", action: "pay" },
    { code: "MONTHLY", name: "Monthly pass", price: p.monthly, perks: "Message any owner for 30 days.", action: "pay" },
    { code: "SQUAD", name: "Squad pass", price: p.squadPerMember, perks: `Per person, split with your squad · ${p.squadDays} days.`, action: "squad" },
  ];
}
