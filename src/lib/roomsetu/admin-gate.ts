/** Where a visitor to /admin/* should go. null = let them in (or let NeedAccount ask them to sign in). */
export function adminRedirect(state: { signedIn: boolean; isAdmin: boolean }): "/dashboard" | null {
  if (!state.signedIn) return null;
  return state.isAdmin ? null : "/dashboard";
}

export function rolesAreAdmin(roles: string[], accountStatus?: string): boolean {
  if (accountStatus === "SUSPENDED") return false;
  return roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
}
