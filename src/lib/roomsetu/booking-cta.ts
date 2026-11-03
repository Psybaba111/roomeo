// One booking CTA on listings. Pure, testable.

export const REQUEST_CTA = "Request this bed";
export const REQUEST_CTA_SIGNED_OUT = "Sign in to request this bed";
export const FEE_UNDER_PRICE = "₹589 one-time Roomeo fee, only after the owner says yes · rent & deposit go straight to the owner";

/** applyToListing throws this when a live request already exists; we still open the chat. */
export function isAlreadyRequested(message: string): boolean {
  return /already have a request/i.test(message);
}

/** Status line after tapping the CTA when the chat could not open (gate, block, etc.). */
export function requestSentLine(chatError: string): string {
  const base = "Request sent 🎉 The owner gets a ping and says yes or no.";
  return chatError ? `${base} Chat isn't open yet: ${chatError}` : base;
}

type AppLite = { listingId: string; seekerId: string; hostId: string; status: string; mine: boolean };

/** The request to pin on top of a chat thread: same listing, same two people, newest live one first. */
export function pinnedRequestFor<T extends AppLite>(apps: T[], thread: { listingId: string; otherId: string } | undefined): T | null {
  if (!thread?.listingId) return null;
  const rank = (s: string) => (s === "ACCEPTED" ? 0 : s === "PENDING" ? 1 : 2);
  const hits = apps
    .filter((a) => a.listingId === thread.listingId && (a.mine ? a.hostId === thread.otherId : a.seekerId === thread.otherId))
    .sort((a, b) => rank(a.status) - rank(b.status));
  return hits[0] ?? null;
}

/** Friendly status chip text for a request. */
export function requestStatusLabel(status: string, mine: boolean): string {
  switch (status) {
    case "PENDING":
      return mine ? "Waiting on the owner ⏳" : "New request · your call";
    case "ACCEPTED":
      return "Accepted 🎉 Next: sign the agreement";
    case "DECLINED":
      return "Declined";
    case "WITHDRAWN":
      return "Withdrawn";
    default:
      return status.toLowerCase();
  }
}
