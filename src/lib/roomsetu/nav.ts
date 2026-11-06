// Bottom-nav model for the simplified IA (PR 1). Pure + testable.
//
// Four tabs, role-aware:
//   renter  Beds · Activity · Chats · Profile
//   owner   Inbox · Chats · My beds · Profile
// Everyone who owns at least one bed sees the owner set, because that is the
// surface with something waiting for them. Renters who also host reach their
// deals from the "Renting too?" link on the inbox.

export type NavRole = "renter" | "owner";
export type NavKey = "beds" | "activity" | "inbox" | "chats" | "mybeds" | "profile";

export type NavTab = {
  key: NavKey;
  label: string;
  /** Route this tab opens. */
  to: "/search" | "/activity" | "/inbox" | "/messages" | "/dashboard" | "/profile";
  /** Path prefixes that light this tab up. */
  match: string[];
  /** Shown on the Inbox tab. */
  badge?: string;
  /** Stable hook for tests and screenshots. */
  testId: string;
};

export function roleOf(p: { isOwner: boolean }): NavRole {
  return p.isOwner ? "owner" : "renter";
}

/** The four tabs for a role. `badge` rides on Inbox only. */
export function navTabs(role: NavRole, badge = ""): NavTab[] {
  if (role === "owner") {
    return [
      { key: "inbox", label: "Inbox", to: "/inbox", match: ["/inbox"], badge, testId: "nav-inbox" },
      { key: "chats", label: "Chats", to: "/messages", match: ["/messages"], testId: "nav-chats" },
      { key: "mybeds", label: "My beds", to: "/dashboard", match: ["/dashboard", "/edit-listing", "/create-listing"], testId: "nav-mybeds" },
      { key: "profile", label: "Profile", to: "/profile", match: ["/profile"], testId: "nav-profile" },
    ];
  }
  return [
    { key: "beds", label: "Beds", to: "/search", match: ["/search", "/listing", "/saved"], testId: "nav-beds" },
    { key: "activity", label: "Activity", to: "/activity", match: ["/activity", "/applications"], testId: "nav-activity" },
    { key: "chats", label: "Chats", to: "/messages", match: ["/messages"], testId: "nav-chats" },
    { key: "profile", label: "Profile", to: "/profile", match: ["/profile"], testId: "nav-profile" },
  ];
}

/** Which tab (if any) is active for a path. */
export function activeTabKey(tabs: NavTab[], path: string): NavKey | null {
  let best: { key: NavKey; len: number } | null = null;
  for (const t of tabs) {
    for (const m of t.match) {
      const hit = path === m || path.startsWith(`${m}/`) || path.startsWith(`${m}?`);
      if (hit && (!best || m.length > best.len)) best = { key: t.key, len: m.length };
    }
  }
  return best?.key ?? null;
}
