export type IdentityDecision = {
  attempts: number;
  status: "VERIFIED" | "UNVERIFIED" | "FAILED";
  closeThreads: boolean;
};

/** First miss can be retried. The second miss closes the thread. A pass does not. */
export function nextIdentityAttempt(attempts: number, passed: boolean): IdentityDecision {
  if (passed) return { attempts, status: "VERIFIED", closeThreads: false };
  const next = attempts + 1;
  if (next >= 2) return { attempts: next, status: "FAILED", closeThreads: true };
  return { attempts: next, status: "UNVERIFIED", closeThreads: false };
}

export function digilockerAuthorizeUrl(base: string, clientId: string, redirectUri: string, state: string): string {
  const root = base.replace(/\/$/, "");
  const url = new URL(`${root}/oauth2/1/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export type DigilockerPerson = {
  name: string;
  digilockerId: string;
  eaadhaar: boolean;
};

/** Accepts the token body or the user-details body. Does not keep a document number. */
export function judgeDigilockerUser(input: unknown): { ok: true; person: DigilockerPerson } | { ok: false; reason: string } {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const idRaw = row.digilocker_id ?? row.digilockerid;
  const digilockerId = typeof idRaw === "string" ? idRaw.trim() : "";
  const ea = String(row.eaadhaar ?? row.eaadhar ?? "").toUpperCase() === "Y";
  if (name.length < 2 || digilockerId.length < 8) {
    return { ok: false, reason: "DigiLocker did not return a name and account id." };
  }
  return { ok: true, person: { name, digilockerId, eaadhaar: ea } };
}

export function callbackUrlFrom(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "";
  const proto = forwardedProto || new URL(request.url).protocol.replace(":", "");
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) throw new Error("Could not build the DigiLocker return address.");
  if (proto !== "https" && proto !== "http") throw new Error("Could not build the DigiLocker return address.");
  return `${proto}://${host}/verify/digilocker`;
}
