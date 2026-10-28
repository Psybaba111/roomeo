import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bookmark, Home, MessageCircle, Search, UserRound, Users } from "lucide-react";
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
  sort: "recommended",
  q: "",
  availableBy: "",
};

const tab = (active: boolean) =>
  `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-brand" : "text-ink"}`;

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
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignedOut>
              <Link
                to="/login"
                className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-semibold text-card"
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
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-0 md:pb-16">{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-6">
          <li>
            <Link to="/" className={tab(path === "/")}>
              <Home className="h-5 w-5" strokeWidth={2} />
              Home
            </Link>
          </li>
          <li>
            <Link to="/search" search={EMPTY_SEARCH} className={tab(path.startsWith("/search"))}>
              <Search className="h-5 w-5" strokeWidth={2} />
              Beds
            </Link>
          </li>
          <li>
            <Link
              to="/messages"
              search={{ thread: "" }}
              className={tab(path.startsWith("/messages"))}
            >
              <MessageCircle className="h-5 w-5" strokeWidth={2} />
              Messages
            </Link>
          </li>
          <li>
            <Link to="/squads" className={tab(path.startsWith("/squads"))}>
              <Users className="h-5 w-5" strokeWidth={2} />
              Squads
            </Link>
          </li>
          <li>
            <Link to="/saved" className={tab(path.startsWith("/saved"))}>
              <Bookmark className="h-5 w-5" strokeWidth={2} />
              Saved
            </Link>
          </li>
          <li>
            <Link to="/profile" className={tab(path.startsWith("/profile"))}>
              <UserRound className="h-5 w-5" strokeWidth={2} />
              Profile
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
