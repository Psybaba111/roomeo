// Pure rules for the manual host ID review. No DB access here so it is testable.

export const ID_DOC_TYPES = [
  { value: "AADHAAR", label: "Aadhaar" },
  { value: "PAN", label: "PAN card" },
  { value: "DL", label: "Driving licence" },
  { value: "PASSPORT", label: "Passport" },
  { value: "VOTER", label: "Voter ID" },
] as const;

export type IdReviewStatus = "" | "PENDING" | "APPROVED" | "REJECTED";

export type IdSubmission = { docType: string; last4: string; nameOnId: string };

/** Validate what a host submits. Only the last 4 characters of the ID are stored, never the full number. */
export function parseIdSubmission(input: unknown): IdSubmission {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const docType = typeof o.docType === "string" ? o.docType.trim().toUpperCase() : "";
  if (!ID_DOC_TYPES.some((d) => d.value === docType)) throw new Error("Pick the ID you are using.");
  const last4 = typeof o.last4 === "string" ? o.last4.trim().toUpperCase() : "";
  if (!/^[0-9A-Z]{4}$/.test(last4)) throw new Error("Enter only the last 4 characters of the ID.");
  const nameOnId = typeof o.nameOnId === "string" ? o.nameOnId.trim().replace(/\s+/g, " ") : "";
  if (nameOnId.length < 2 || nameOnId.length > 80)
    throw new Error("Enter your name exactly as it is on the ID.");
  return { docType, last4, nameOnId };
}

export type HostDecision = { userId: string; decision: "APPROVE" | "REJECT"; reason: string };

export function parseHostDecision(input: unknown): HostDecision {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const userId = typeof o.userId === "string" ? o.userId.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(userId)) throw new Error("Unknown host.");
  const decision = o.decision === "APPROVE" || o.decision === "REJECT" ? o.decision : null;
  if (!decision) throw new Error("Unknown decision.");
  const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 300) : "";
  if (decision === "REJECT" && reason.length < 5)
    throw new Error("Give the host a reason (at least 5 characters).");
  return { userId, decision, reason };
}

/** Whether an operator may decide on this host. */
export function decisionBlocker(p: {
  actorId: string;
  targetId: string;
  identitySource: string;
  reviewStatus: string;
  decision: "APPROVE" | "REJECT";
}): string | null {
  if (p.actorId === p.targetId) return "You cannot decide your own ID.";
  if (p.identitySource === "DIGILOCKER") return "DigiLocker already verified this host.";
  if (p.decision === "APPROVE" && p.reviewStatus !== "PENDING")
    return "This host has not submitted ID details yet.";
  return null;
}

/** Host-facing status line. */
export function hostReviewMessage(p: {
  identityStatus: string;
  identitySource: string;
  reviewStatus: string;
  note: string;
}): { tone: "ok" | "wait" | "bad" | "none"; text: string } {
  if (p.identityStatus === "VERIFIED") {
    return p.identitySource === "DIGILOCKER"
      ? { tone: "ok", text: "ID verified with DigiLocker. You can publish beds." }
      : { tone: "ok", text: "ID approved by the roomeo team. You can publish beds." };
  }
  if (p.reviewStatus === "PENDING")
    return {
      tone: "wait",
      text: "ID submitted. The roomeo team is reviewing it, usually within a day.",
    };
  if (p.reviewStatus === "REJECTED")
    return {
      tone: "bad",
      text: `ID not approved${p.note ? `: ${p.note}` : "."} Fix it and submit again.`,
    };
  return {
    tone: "none",
    text: "Submit your ID details so the roomeo team can approve you to publish.",
  };
}
