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
  actorRoles?: readonly string[];
  reason?: string;
}): string | null {
  if (p.actorId === p.targetId) {
    if (!(p.actorRoles ?? []).includes("SUPER_ADMIN")) return "You cannot decide your own ID.";
    if ((p.reason ?? "").trim().length < 5) return "Self-decision needs a reason (at least 5 characters).";
  }
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

export type IdReviewView =
  | { kind: "approved"; showForm: false; verifiedBadge: boolean; via: "DIGILOCKER" | "STAFF" }
  | { kind: "pending"; showForm: false; docLabel: string; last4: string; nameOnId: string; submittedAt: string }
  | { kind: "rejected"; showForm: true; reason: string }
  | { kind: "none"; showForm: true };

export function idDocLabel(v: string): string {
  return ID_DOC_TYPES.find((d) => d.value === v)?.label ?? (v || "ID");
}

/** What the host sees in the ID card on /verification. Pure so it can be unit tested. */
export function idReviewView(p: {
  identityStatus: string;
  identitySource: string;
  reviewStatus: string;
  note: string;
  docType: string;
  last4: string;
  nameOnId: string;
  submittedAt: string;
  phoneVerified: boolean;
}): IdReviewView {
  if (p.identityStatus === "VERIFIED")
    return { kind: "approved", showForm: false, verifiedBadge: p.phoneVerified, via: p.identitySource === "DIGILOCKER" ? "DIGILOCKER" : "STAFF" };
  if (p.reviewStatus === "PENDING")
    return { kind: "pending", showForm: false, docLabel: idDocLabel(p.docType), last4: p.last4, nameOnId: p.nameOnId, submittedAt: p.submittedAt };
  if (p.reviewStatus === "REJECTED") return { kind: "rejected", showForm: true, reason: p.note };
  return { kind: "none", showForm: true };
}

/** Profile-level verification_status: the Verified badge needs both ID and phone. */
export function badgeStatus(identityVerified: boolean, phoneVerified: boolean): "VERIFIED" | "UNVERIFIED" {
  return identityVerified && phoneVerified ? "VERIFIED" : "UNVERIFIED";
}

export function formatIst(iso: string): string {
  if (!iso) return "";
  // Postgres ::text gives "2026-10-29 16:53:43.386+00"; normalise to strict ISO so Safari parses it too.
  let norm = iso.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(norm)) norm += "Z";
  const d = new Date(norm);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST`;
}

/** A self-decision on your own ID: only SUPER_ADMIN may do this, and it is always audited as such. */
export function isSelfDecision(actorId: string, targetId: string): boolean {
  return actorId === targetId;
}

export function selfDecisionAudit(decision: "APPROVE" | "REJECT", reason: string): { action: string; detail: string } {
  return {
    action: decision === "APPROVE" ? "HOST_ID_SELF_APPROVED" : "HOST_ID_SELF_REJECTED",
    detail: `SELF-DECISION by SUPER_ADMIN (actor = subject). Reason: ${reason.trim()}`,
  };
}

export const SELF_DECISION_WARNING =
  "Heads up: this is YOUR OWN ID. Self-approval skips a second pair of eyes and is logged as a self-decision. Continue?";
