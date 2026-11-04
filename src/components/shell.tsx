import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bed as BedIcon,
  ChatCircle as MessageCircle,
  House as Home,
  MagnifyingGlass as Search,
  Tray,
  UserCircle as UserRound,
} from "@phosphor-icons/react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getInboxSummary } from "@/lib/roomsetu/owner-inbox-api";
import { inboxBadgeLabel } from "@/lib/roomsetu/owner-inbox";
import { activeTabKey, navTabs, type NavKey, type NavTab } from "@/lib/roomsetu/nav";

export const EMPTY_SEARCH = {
  city: "",
  locality: "",
  maxRent: "",
  roomType: "",
  furnished: "",
  gender: "",
  food: "",
  kind: "",
  sort: "recommended",
  q: "",
  availableBy: "",
};

/** Owner flag + badge for the nav. Quietly off when signed out or on error. */
function useOwnerInbox(path: string) {
  const { user } = useCurrentUserState();
  const [state, setState] = useState({ isOwner: false, badge: 0 });
  useEffect(() => {
    if (!user) {
      setState({ isOwner: false, badge: 0 });
      return;
    }
    let live = true;
    const pull = () =>
      void getInboxSummary()
        .then((s) => live && setState({ isOwner: s.isOwner, badge: s.badge }))
        .catch(() => undefined);
    pull();
    const t = setInterval(pull, 30000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [user, path]);
  return state;
}

const tab = (active: boolean) =>
  `flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${active ? "text-brand" : "text-ink"}`;

const desktopLink = (active: boolean) => `hover:text-brand ${active ? "text-brand" : ""}`;

function TabIcon({ tabKey, badge }: { tabKey: NavKey; badge?: string }) {
  const cls = "h-5 w-5";
  switch (tabKey) {
    case "beds":
      return <Search className={cls} />;
    case "activity":
      return <BedIcon className={cls} />;
    case "inbox":
      return (
        <span className="relative">
          <Tray className={cls} />
          {badge ? (
            <span
              className="absolute -right-3 -top-2 min-w-5 rounded-full bg-brand px-1 text-center text-[10px] leading-5 text-card"
              data-testid="inbox-badge"
              aria-label={`${badge} things waiting`}
            >
              {badge}
            </span>
          ) : null}
        </span>
      );
    case "chats":
      return <MessageCircle className={cls} />;
    case "mybeds":
      return <Home className={cls} />;
    default:
      return <UserRound className={cls} />;
  }
}

/** One bottom-nav link. `to` is kept narrow so the typed router stays happy. */
function TabLink({ item, active }: { item: NavTab; active: boolean }) {
  const body = (
    <>
      <TabIcon tabKey={item.key} badge={item.badge} />
      {item.label}
    </>
  );
  const testId = item.testId;
  if (item.to === "/search") {
    return (
      <Link to="/search" search={EMPTY_SEARCH} className={tab(active)} data-testid={testId} aria-current={active ? "page" : undefined}>
        {body}
      </Link>
    );
  }
  if (item.to === "/messages") {
    return (
      <Link to="/messages" search={{ thread: "" }} className={tab(active)} data-testid={testId} aria-current={active ? "page" : undefined}>
        {body}
      </Link>
    );
  }
  if (item.to === "/activity") {
    return (
      <Link to="/activity" className={tab(active)} data-testid={testId} aria-current={active ? "page" : undefined}>
        {body}
      </Link>
    );
  }
  if (item.to === "/inbox") {
    return (
      <Link to="/inbox" className={tab(active)} data-testid={testId} aria-current={active ? "page" : undefined}>
        {body}
      </Link>
    );
  }
  if (item.to === "/dashboard") {
    return (
      <Link to="/dashboard" className={tab(active)} data-testid={testId} aria-current={active ? "page" : undefined}>
        {body}
      </Link>
    );
  }
  return (
    <Link to={item.to} className={tab(active)} data-testid={testId} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  );
}

/** Desktop twin of a bottom tab: same route, same label, wider type. */
function DesktopLink({ item, active }: { item: NavTab; active: boolean }) {
  const cls = desktopLink(active);
  const testId = `desktop-${item.key}`;
  const label = (
    <>
      {item.label}
      {item.badge ? ` (${item.badge})` : ""}
    </>
  );
  if (item.to === "/search")
    return (
      <Link to="/search" search={EMPTY_SEARCH} className={cls} data-testid={testId}>
        {label}
      </Link>
    );
  if (item.to === "/messages")
    return (
      <Link to="/messages" search={{ thread: "" }} className={cls} data-testid={testId}>
        {label}
      </Link>
    );
  if (item.to === "/activity")
    return (
      <Link to="/activity" className={cls} data-testid={testId}>
        {label}
      </Link>
    );
  if (item.to === "/inbox")
    return (
      <Link to="/inbox" className={cls} data-testid={testId}>
        {label}
      </Link>
    );
  if (item.to === "/dashboard")
    return (
      <Link to="/dashboard" className={cls} data-testid={testId}>
        {label}
      </Link>
    );
  return (
    <Link to="/profile" className={cls} data-testid={testId}>
      {label}
    </Link>
  );
}

/**
 * App chrome. Four bottom tabs, role-aware (see src/lib/roomsetu/nav.ts):
 * renters get Beds · Activity · Chats · Profile, owners get
 * Inbox · Chats · My beds · Profile. Desktop keeps a wider bar with the same
 * information architecture plus the public links.
 */
export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const owner = useOwnerInbox(path);
  const badge = inboxBadgeLabel(owner.badge);
  const role = owner.isOwner ? "owner" : "renter";
  const tabs = navTabs(role, badge);
  const active = activeTabKey(tabs, path);
  return (
    <div className="min-h-screen overflow-x-hidden bg-paper text-ink">
      <header className="sticky top-0 z-30 h-[60px] border-b border-line bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" className="font-display text-xl font-extrabold tracking-tight text-brand">
            roomeo
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-medium md:flex" aria-label="Main">
            {tabs.map((t) => (
              <DesktopLink key={t.key} item={t} active={active === t.key} />
            ))}
            <Link to="/create-listing" className="hover:text-brand">
              List a bed
            </Link>
            <Link to="/pricing" className="hover:text-brand">
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignedOut>
              <Link
                to="/login"
                className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-semibold text-card"
              >
                Sign in
              </Link>
            </SignedOut>
            <SignedIn>
              <div className="hidden md:block">
                <UserButton />
              </div>
            </SignedIn>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-6 pt-0 md:pb-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-28 pt-4 text-xs text-muted md:pb-10" data-testid="site-footer">
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/privacy" className="hover:underline">Privacy</Link>
          <Link to="/terms" className="hover:underline">Terms</Link>
          <Link to="/pricing" className="hover:underline">Pricing</Link>
          <Link to="/squads" className="hover:underline">Squads</Link>
          <span>© 2026 Athiti Hospitality Services Pvt Ltd</span>
        </p>
      </footer>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur md:hidden"
        data-testid="bottom-nav"
      >
        <ul className={`grid ${tabs.length === 4 ? "grid-cols-4" : "grid-cols-5"}`}>
          {tabs.map((t) => (
            <li key={t.key} className="min-w-0">
              <TabLink item={t} active={active === t.key} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
