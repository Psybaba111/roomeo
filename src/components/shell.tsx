import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookmarkSimple as Bookmark, House as Home, ChatCircle as MessageCircle, MagnifyingGlass as Search, UserCircle as UserRound, UsersThree as Users } from "@phosphor-icons/react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { ThemeToggle } from "@/components/theme-toggle";

const EMPTY_SEARCH = {
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

const tab = (active: boolean) =>
  `flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${active ? "text-brand" : "text-ink"}`;

export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen overflow-x-hidden bg-paper text-ink">
      <header className="sticky top-0 z-30 h-[60px] border-b border-line bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" className="font-display text-xl font-extrabold tracking-tight text-brand">
            roomeo
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <Link to="/search" search={EMPTY_SEARCH} className="hover:text-brand">
              Beds
            </Link>
            <Link to="/squads" className="hover:text-brand">
              Squads
            </Link>
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
              <Link
                to="/dashboard"
                className="inline-flex h-9 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold md:hidden"
              >
                Yours
              </Link>
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
          <span>© 2026 Athiti Hospitality Services Pvt Ltd</span>
        </p>
      </footer>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-6">
          <li>
            <Link to="/" className={tab(path === "/")}>
              <Home className="h-5 w-5" />
              Home
            </Link>
          </li>
          <li>
            <Link to="/search" search={EMPTY_SEARCH} className={tab(path.startsWith("/search"))}>
              <Search className="h-5 w-5" />
              Beds
            </Link>
          </li>
          <li>
            <Link
              to="/messages"
              search={{ thread: "" }}
              className={tab(path.startsWith("/messages"))}
            >
              <MessageCircle className="h-5 w-5" />
              Messages
            </Link>
          </li>
          <li>
            <Link to="/squads" className={tab(path.startsWith("/squads"))}>
              <Users className="h-5 w-5" />
              Squads
            </Link>
          </li>
          <li>
            <Link to="/saved" className={tab(path.startsWith("/saved"))}>
              <Bookmark className="h-5 w-5" />
              Saved
            </Link>
          </li>
          <li>
            <Link to="/profile" className={tab(path.startsWith("/profile"))}>
              <UserRound className="h-5 w-5" />
              Profile
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
