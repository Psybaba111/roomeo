export function errText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong.";
}

export function safeNext(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/dashboard";
  if (/[\\:\r\n]/.test(path)) return "/dashboard";
  return path;
}
