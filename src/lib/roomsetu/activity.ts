// Activity: one list of deals for the renter. Pure + testable — the page in
// src/routes/activity.tsx only maps these rows to UI.
//
// A "deal" is one row from listApplications() (the same call /dashboard and
// /applications already use), enriched with the signed-agreement snapshot so a
// row can name its current step without a second round trip per row.
import { dealSteps, type DealStep } from "./deal-steps.ts";

/** Which of the four buckets a deal sits in. Order = display order. */
export type ActivityGroup = "needs-you" | "waiting" | "active" | "done";

export const ACTIVITY_GROUPS: { key: ActivityGroup; label: string; blurb: string }[] = [
  { key: "needs-you", label: "Needs you", blurb: "Your move." },
  { key: "waiting", label: "Waiting on owner", blurb: "Sent. Sit tight." },
  { key: "active", label: "Active", blurb: "In progress." },
  { key: "done", label: "Done", blurb: "Wrapped up." },
];

/** The agreement snapshot a row needs: signed / issued / cancelled / moved in. */
export type DealFacts = {
  iSigned: boolean;
  issued: boolean;
  cancelled: boolean;
  feeOn: boolean;
  feePaid: boolean;
  feeTotal: number;
  movedIn: boolean;
};

export type DealLite = {
  id: string;
  listingId: string;
  title: string;
  city: string;
  rent: number;
  deposit: number;
  status: string;
  mine: boolean;
  otherName: string;
  photo?: string | null;
};

export type ActivityRow<T extends DealLite> = {
  deal: T;
  group: ActivityGroup;
  steps: DealStep[];
  /** The one step the person should act on now, or null when nothing is theirs. */
  current: DealStep | null;
  /** Short line under the title, e.g. "Owner said yes 🎉". */
  statusLine: string;
};

/** Friendly line for the deal's state, tenant-side wording. */
export function activityStatusLine(p: { status: string; group: ActivityGroup }): string {
  if (p.status === "PENDING") return "Waiting on the owner to say yes ⏳";
  if (p.status === "DECLINED") return "Owner couldn't take this one";
  if (p.status === "WITHDRAWN") return "You withdrew this request";
  if (p.status === "ACCEPTED") {
    if (p.group === "done") return "You're in — welcome home 🏠";
    if (p.group === "needs-you") return "Owner said yes 🎉 Your turn 👇";
    return "Owner said yes 🎉 Moving along";
  }
  return p.status.toLowerCase();
}

/**
 * Bucket a deal. Renter-facing, so "needs you" means the next deal step is
 * theirs; an accepted deal where they are waiting on the other side sits in
 * "waiting", not "needs you".
 */
export function groupOf(p: { status: string; mine: boolean; facts: DealFacts }): ActivityGroup {
  if (p.status === "DECLINED" || p.status === "WITHDRAWN") return "done";
  if (p.status === "PENDING") return p.mine ? "waiting" : "needs-you";
  if (p.status !== "ACCEPTED") return "active";
  const steps = dealSteps({
    role: "tenant",
    iSigned: p.facts.iSigned,
    issued: p.facts.issued,
    cancelled: p.facts.cancelled,
    feeOn: p.facts.feeOn,
    feePaid: p.facts.feePaid,
    feeTotal: p.facts.feeTotal,
    movedIn: p.facts.movedIn,
  });
  const now = steps.find((s) => s.state === "now");
  if (!now) return "done";
  // "Accepted" is the owner's action; when it is the current step the tenant is
  // still waiting. Anything later (sign / pay / move in) is the tenant's turn,
  // unless the hint says they already signed and it is on the other side.
  if (now.key === "accepted") return "waiting";
  if (now.key === "sign" && p.facts.iSigned) return "waiting";
  return "needs-you";
}

/** Sort inside a bucket: newest first is what people expect for a to-do list. */
export function sortRows<T extends { group: ActivityGroup }>(rows: T[]): T[] {
  const rank: Record<ActivityGroup, number> = { "needs-you": 0, waiting: 1, active: 2, done: 3 };
  return [...rows].sort((a, b) => rank[a.group] - rank[b.group]);
}

/** Group rows for rendering, dropping empty buckets. */
export function byGroup<T extends { group: ActivityGroup }>(rows: T[]) {
  return ACTIVITY_GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.group === g.key) })).filter((g) => g.rows.length > 0);
}

/** Build one row from a deal plus its facts. */
export function activityRow<T extends DealLite>(deal: T, facts: DealFacts): ActivityRow<T> {
  const group = groupOf({ status: deal.status, mine: deal.mine, facts });
  const steps = dealSteps({
    role: "tenant",
    iSigned: facts.iSigned,
    issued: facts.issued,
    cancelled: facts.cancelled,
    feeOn: facts.feeOn,
    feePaid: facts.feePaid,
    feeTotal: facts.feeTotal,
    movedIn: facts.movedIn,
  });
  const current = steps.find((s) => s.state === "now") ?? null;
  return { deal, group, steps, current, statusLine: activityStatusLine({ status: deal.status, group }) };
}

/** The single primary button label for a row. Never more than one action. */
export function primaryAction(row: { group: ActivityGroup; deal: { status: string; mine: boolean }; current: DealStep | null }): { label: string; kind: "sign" | "pay" | "movein" | "chat" | "none" } {
  if (row.group === "waiting") return { label: "Chat", kind: "chat" };
  if (row.group === "done") return { label: "Chat", kind: "chat" };
  if (row.deal.status === "PENDING" && !row.deal.mine) return { label: "Accept or decline", kind: "none" };
  switch (row.current?.key) {
    case "sign":
      return row.current.state === "now" ? { label: "Sign agreement", kind: "sign" } : { label: "Chat", kind: "chat" };
    case "pay":
      return { label: "Pay ₹589", kind: "pay" };
    case "movein":
      return { label: "Move in", kind: "movein" };
    default:
      return { label: "Chat", kind: "chat" };
  }
}

/** Fee line shown once per page, never per row. Kept in one place so it can't drift. */
export const ACTIVITY_FEE_LINE =
  "₹589 one-time Roomeo fee (₹499 + GST), renter and owner each pay it once, only after the owner says yes. Rent and deposit go straight to the owner.";
