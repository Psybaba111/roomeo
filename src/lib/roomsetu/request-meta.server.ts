import { getRequest } from "@tanstack/react-start/server";

/** Caller IP + user agent for e-sign audit. Server-only (keeps the .server suffix). */
export function requestMeta(): { ip: string; userAgent: string } {
  const r = getRequest();
  const fwd = r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return { ip: (fwd || r.headers.get("x-real-ip") || "").slice(0, 64), userAgent: (r.headers.get("user-agent") ?? "").slice(0, 300) };
}
