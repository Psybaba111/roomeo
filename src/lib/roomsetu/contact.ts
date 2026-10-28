// Contact unlock fee + squad rules. Pure, testable.

export const DEFAULT_CONTACT_FEE_INR = 499;

/** ROOMEO_CONTACT_FEE (whole rupees, 1..100000). Falls back to ₹499. */
export function contactFeeInr(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): number {
  const raw = Number(env.ROOMEO_CONTACT_FEE?.trim());
  return Number.isInteger(raw) && raw > 0 && raw <= 100000 ? raw : DEFAULT_CONTACT_FEE_INR;
}

/**
 * Who has to pay before messaging. Hosts never pay: the owner of the listing, and a
 * host replying to an applicant, are always free. Only a seeker opening contact with an owner pays.
 */
export function contactNeedsPayment(p: {
  viewerId: string;
  ownerId: string;
  unlocked: boolean;
  existingThread: boolean;
}): boolean {
  if (p.viewerId === p.ownerId) return false;
  if (p.existingThread) return false;
  return !p.unlocked;
}

export type SquadInput = {
  name: string;
  area: string;
  budgetPerPerson: number;
  moveIn: string;
  size: number;
};

export function parseSquadInput(input: unknown): SquadInput {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const s = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
  const name = s(o.name, 60);
  if (name.length < 2) throw new Error("Give your squad a name.");
  const area = s(o.area, 60);
  if (area.length < 2) throw new Error("Pick the area you want to live in.");
  const budgetPerPerson = Number(o.budgetPerPerson);
  if (!Number.isInteger(budgetPerPerson) || budgetPerPerson < 1000 || budgetPerPerson > 200000)
    throw new Error("Budget per person must be between ₹1,000 and ₹2,00,000.");
  const moveIn = s(o.moveIn, 10);
  if (moveIn && !/^\d{4}-\d{2}-\d{2}$/.test(moveIn)) throw new Error("Pick a move-in date.");
  const size = Number(o.size);
  if (!Number.isInteger(size) || size < 2 || size > 4) throw new Error("A squad is 2 to 4 people.");
  return { name, area, budgetPerPerson, moveIn, size };
}

/** Invite code: 10 chars, unambiguous alphabet. */
export function makeInviteCode(
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const A = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(random(10), (b) => A[b % A.length]).join("");
}

export function joinBlocker(p: {
  phoneVerified: boolean;
  activeMembers: number;
  size: number;
  alreadyMember: boolean;
  status: string;
}): string | null {
  if (p.alreadyMember) return null;
  if (p.status === "CLOSED") return "This squad is closed.";
  if (!p.phoneVerified) return "Verify your phone number before joining a squad.";
  if (p.activeMembers >= p.size) return "This squad is full.";
  return null;
}

/** All current members voted yes and the squad is full. */
export function allSaidYes(p: { size: number; memberIds: string[]; yesIds: string[] }): boolean {
  if (p.memberIds.length < 2 || p.memberIds.length !== p.size) return false;
  const yes = new Set(p.yesIds);
  return p.memberIds.every((id) => yes.has(id));
}

export const OWNER_DECISIONS = ["ACCEPTED", "DECLINED", "VISIT_PROPOSED"] as const;
export type OwnerDecision = (typeof OWNER_DECISIONS)[number];

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Refund rule for the contact fee: refunded only when the owner declines a proposal
 * (application or squad request) that they had NOT accepted before. No refund once the
 * owner accepted, and none when the seeker withdraws or leaves.
 */
export function contactRefundDue(p: { decision: string; previousStatus: string }): boolean {
  return (
    p.decision === "DECLINED" && p.previousStatus !== "ACCEPTED" && p.previousStatus !== "DECLINED"
  );
}

export const REFUND_RULE =
  "If the owner declines your request, the ₹ contact fee is refunded to your UPI ID. No refund once the owner has accepted, or if you withdraw or leave.";
