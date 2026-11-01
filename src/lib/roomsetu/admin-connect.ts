/** Connection helpers for scripts/admin-grant.mjs (kept here so they are unit-tested). */

export type Driver = "http" | "tcp";

/** Neon hosts look like ep-xxx(-pooler).region.aws.neon.tech. */
export function isNeonHost(url: string): boolean {
  try {
    return /(^|\.)neon\.tech$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** --http forces the HTTPS driver, --tcp forces node-postgres; otherwise Neon hosts use HTTPS. */
export function chooseDriver(url: string, args: string[]): Driver {
  if (args.includes("--tcp")) return "tcp";
  if (args.includes("--http")) return "http";
  return isNeonHost(url) ? "http" : "tcp";
}

/** Parse --timeout=<seconds> (default 15). Returns milliseconds. */
export function parseTimeoutMs(args: string[], fallbackSeconds = 15): number {
  const a = args.find((x) => x.startsWith("--timeout="));
  const n = a ? Number(a.slice("--timeout=".length)) : fallbackSeconds;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : fallbackSeconds * 1000;
}

/** Reject with a clear message if `p` does not settle within `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${what} timed out after ${Math.round(ms / 1000)}s. The database may be unreachable from this network ` +
              `(TCP 5432 blocked?). For Neon, try --http; or raise the limit with --timeout=<seconds>.`,
          ),
        ),
      ms,
    );
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}
