// Pure booking-funnel labels and rules (no DB, no node APIs) so admin pages and tests can import them.

export type FunnelStepKey = "search" | "listing_view" | "request_submitted" | "owner_responded" | "request_accepted" | "payment_completed" | "moved_in" | "whatsapp_click";
export type FunnelStep = {
  key: FunnelStepKey;
  label: string;
  /** From DB state (null when the step is only in GA4). */
  count: number | null;
  /** Rows in the funnel_events log for the same window (null when the log isn't there or the step isn't logged). */
  logged: number | null;
  source: string;
};
export type FunnelWindow = { days: 7 | 30; steps: FunnelStep[] };

export const FUNNEL_LABELS: Record<FunnelStepKey, string> = {
  search: "Searches",
  listing_view: "Listing views",
  request_submitted: "Requests sent",
  owner_responded: "Owner replied",
  request_accepted: "Owner said yes",
  payment_completed: "Payment completed",
  moved_in: "Moved in",
  whatsapp_click: "WhatsApp taps",
};

export const FUNNEL_SOURCES: Record<FunnelStepKey, string> = {
  search: "metric_events 'search' rows (one per search request)",
  listing_view: "GA4 only. Views are not counted in the database",
  request_submitted: "applications created (demo beds left out)",
  owner_responded: "applications now accepted or declined, by last status change",
  request_accepted: "applications now accepted, or that went on to a move-in",
  payment_completed: "contact and success fee payments marked paid",
  moved_in: "move-ins confirmed by both sides (single and squad)",
  whatsapp_click: "GA4 only",
};

/** "12%" step-to-step, or "" when it can't be worked out. */
export function stepRate(prev: number | null, cur: number | null): string {
  if (prev == null || cur == null || prev <= 0) return "";
  return `${Math.round((cur / prev) * 100)}%`;
}

/** Why a due nudge can't go out right now ("" when it can). Pure. */
export function nudgeHoldReason(p: { flagOn: boolean; templateSet: boolean; apiKeySet: boolean; ownerPhone: string | null }): string {
  if (!p.flagOn) return "MAPPSTORE_NOTIFY_ENABLED is off";
  if (!p.apiKeySet) return "MappStore API key not set";
  if (!p.templateSet) return "MAPPSTORE_TPL_OWNER_NUDGE not set";
  if (!p.ownerPhone) return "owner has no verified phone";
  return "";
}

/** "Mud Home Premium PG · 6-sharing AC bed · MPT Road" -> "6-sharing AC bed"; plain titles are kept (max 60). */
export function nudgeBedLabel(title: string): string {
  const parts = String(title ?? "").split("·").map((x) => x.trim()).filter(Boolean);
  return (parts.length >= 3 ? parts[1] : String(title ?? "").trim()).slice(0, 60) || "your bed";
}

