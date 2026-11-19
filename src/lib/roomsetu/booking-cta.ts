// One booking CTA on listings. Pure, testable.

export const REQUEST_CTA = "Request this bed";
export const REQUEST_CTA_SIGNED_OUT = "Sign in to request this bed";
/** Secondary listing action: just open a chat, no bed request. */
export const MESSAGE_CTA = "Message the owner";

/**
 * Signed in or not, right on first paint (QA review Q3, 19 Nov 2026). The listing loader already resolves
 * the viewer on the server (getListing middleware), so we start from that and only switch to the client
 * session once it has loaded. No "Loading…" label, no disabled button while the session resolves.
 */
export function viewerSignedIn(serverSignedIn: boolean, client: { isPending: boolean; signedIn: boolean }): boolean {
  return client.isPending ? serverSignedIn : client.signedIn;
}

export type CtaState = { requesting: boolean; signedIn: boolean };

/** Label for the "Request this bed" buttons. `compact` is the sticky bar. */
export function requestCtaLabel(s: CtaState, compact = false): string {
  if (s.requesting) return compact ? "Sending…" : "Sending your request…";
  return s.signedIn ? REQUEST_CTA : REQUEST_CTA_SIGNED_OUT;
}

/** Buttons are disabled only while a request is in flight. */
export function ctaDisabled(s: Pick<CtaState, "requesting">): boolean {
  return s.requesting;
}

/**
 * The fee note that sits next to every "Request this bed" (QA review Q11). Built from the tenant fee flag,
 * so it never shows an amount while the fee is off. With the fee on (prod today): requesting is free and
 * the ₹499 (GST included) is only charged after the owner accepts, when the stay is locked.
 */
export function requestFeeNote(f: { on: boolean; totalInr: number }, compact = false): string {
  if (f.on && f.totalInr > 0)
    return compact ? `₹${f.totalInr} only if the owner says yes` : `Free to request. ₹${f.totalInr} Roomeo fee (GST included), charged only after the owner says yes`;
  return compact ? "Free to request" : "Free to request. No Roomeo fee for tenants";
}
// The fee line under the price is `feeUnderPrice(fee)` in `fee-copy.ts` (built from the fee setting).

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9 Nov 2026, 3:05 PM IST" from an ISO timestamp. Fixed +5:30, no Intl/ICU dependence. */
export function istStamp(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 330 * 60_000);
  const h = d.getUTCHours();
  const hh = h % 12 || 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} ${h < 12 ? "AM" : "PM"} IST`;
}

/**
 * Who withdrew a request and when. Only the seeker can withdraw (setApplication enforces it),
 * and updated_at is set on that status change, so both come from the request row itself.
 */
export function withdrawalLine(row: { status: string; mine: boolean; seekerName: string; updatedAt: string }): string {
  if (row.status !== "WITHDRAWN") return "";
  const who = row.mine ? "You" : row.seekerName.trim() || "The renter";
  const when = istStamp(row.updatedAt);
  return when ? `${who} withdrew this request · ${when}` : `${who} withdrew this request`;
}

/** Fallback link to one request on /applications (the row carries id="req-<id>"). */
export function requestHref(id: string): string {
  return `/applications#req-${encodeURIComponent(id)}`;
}
