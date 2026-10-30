// Rules for operator actions on a listing (verify, pause, activate). Pure so they're tested.
export type ListingAction = "verify" | "reject" | "remove" | "feature" | "restore" | "pause" | "activate";
export const LISTING_ACTIONS: readonly ListingAction[] = ["verify", "reject", "remove", "feature", "restore", "pause", "activate"];

export type ModerationInput = {
  action: ListingAction;
  actorIsOwner: boolean;
  actorIsSuperAdmin: boolean;
  reason: string;
  listingStatus: string;
  ownerCanPublish: boolean;
};

/** Returns a human reason the action is blocked, or "" when it may go ahead. */
export function moderationBlock(p: ModerationInput): string {
  const selfReview = p.actorIsOwner && (p.action === "verify" || p.action === "feature");
  if (selfReview && !p.actorIsSuperAdmin) return "Another operator has to review your listing.";
  if (selfReview && p.reason.trim().length < 5) return "Self-review needs a reason (5+ characters). It goes in the audit log.";
  if (p.listingStatus === "REMOVED" && (p.action === "activate" || p.action === "pause")) return "This listing was removed. Use Restore first.";
  if (p.action === "activate" && !p.ownerCanPublish) return "The owner's phone and ID must both be verified before this bed can go live.";
  if (p.action === "pause" && p.listingStatus === "PAUSED") return "Already paused.";
  if (p.action === "activate" && p.listingStatus === "ACTIVE") return "Already live.";
  return "";
}

/** Audit action name; self-reviews by a super admin are logged distinctly. */
export function auditAction(p: Pick<ModerationInput, "action" | "actorIsOwner">): string {
  if (p.actorIsOwner && (p.action === "verify" || p.action === "feature")) return `LISTING_SELF_${p.action.toUpperCase()}`;
  return p.action;
}

export const ACTION_DONE: Record<ListingAction, string> = {
  verify: "Listing verified ✓",
  reject: "Listing rejected",
  remove: "Listing removed",
  feature: "Listing featured ✓",
  restore: "Listing restored, review pending",
  pause: "Listing paused. Hidden from search.",
  activate: "Listing is live ✓",
};
