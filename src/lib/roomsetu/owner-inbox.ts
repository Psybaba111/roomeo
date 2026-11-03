// Owner Inbox helpers. Pure, testable.

export type InboxCounts = { newRequests: number; unreadChats: number; paymentsWaiting: number };

/** One number for the nav badge: things the owner should act on now. */
export function inboxBadgeCount(c: Partial<InboxCounts>): number {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return n(c.newRequests) + n(c.unreadChats) + n(c.paymentsWaiting);
}

/** Badge text: hidden at 0, capped at "9+" so it fits the tab. */
export function inboxBadgeLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > 9 ? "9+" : String(Math.floor(count));
}

/** Owners: anyone with at least one bed listed (not removed). */
export function isOwner(p: { listingCount: number }): boolean {
  return p.listingCount > 0;
}

/** Count chats with unread messages (not total messages). */
export function unreadChatCount(threads: { unread: number }[]): number {
  return threads.filter((t) => t.unread > 0).length;
}

export type DealRow = { issued: boolean; cancelled: boolean; ownerSigned: boolean; seekerSigned: boolean; feeStatus: string };

/** Where an accepted deal is stuck, in owner words. Null when nothing is waiting. */
export function dealWaiting(d: DealRow): { step: string; hint: string; reviewable: boolean } | null {
  if (d.cancelled) return null;
  if (!d.issued) {
    if (!d.ownerSigned) return { step: "Sign agreement", hint: "Your turn: read it and sign ✍️", reviewable: false };
    return { step: "Sign agreement", hint: "You signed. Waiting on the tenant.", reviewable: false };
  }
  if (d.feeStatus === "PAID") return null;
  if (d.feeStatus === "SUBMITTED") return { step: "Pay fee", hint: "Tenant paid ₹589. UTR is in, needs a check.", reviewable: true };
  return { step: "Pay fee", hint: "Waiting on the tenant's ₹589 fee.", reviewable: false };
}

export const INBOX_EMPTY = "All caught up ✨ Share your listing to get DMs";
