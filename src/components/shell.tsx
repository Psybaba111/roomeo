import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bookmark, Home, MessageCircle, Search, UserRound } from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";

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
  `flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${active ? "text-brand" : "text-muted"}`;

export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-9 w-9" />
            <span className="font-display text-xl font-medium tracking-tight">
              roomeo<span className="text-brand">.com</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <Link to="/search" search={EMPTY_SEARCH} className="hover:text-brand">
              Beds
            </Link>
            <Link to="/create-listing" className="hover:text-brand">
              List a bed
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <SignedOut>
              <Link to="/login" className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-sm font-semibold text-card">
                Sign in
              </Link>
            </SignedOut>
            <SignedIn>
              <div className="hidden md:block">
                <UserButton />
              </div>
              <Link to="/dashboard" className="inline-flex h-11 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold md:hidden">
                Yours
              </Link>
            </SignedIn>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-16">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card md:hidden">
        <ul className="grid grid-cols-5">
          <li>
            <Link to="/" className={tab(path === "/")}>
              <Home className="h-5 w-5" strokeWidth={1.75} />
              Home
            </Link>
          </li>
          <li>
            <Link to="/search" search={EMPTY_SEARCH} className={tab(path.startsWith("/search"))}>
              <Search className="h-5 w-5" strokeWidth={1.75} />
              Beds
            </Link>
          </li>
          <li>
            <Link to="/messages" search={{ thread: "" }} className={tab(path.startsWith("/messages"))}>
              <MessageCircle className="h-5 w-5" strokeWidth={1.75} />
              Messages
            </Link>
          </li>
          <li>
            <Link to="/saved" className={tab(path.startsWith("/saved"))}>
              <Bookmark className="h-5 w-5" strokeWidth={1.75} />
              Saved
            </Link>
          </li>
          <li>
            <Link to="/profile" className={tab(path.startsWith("/profile"))}>
              <UserRound className="h-5 w-5" strokeWidth={1.75} />
              Profile
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

export function errText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong.";
}

export function safeNext(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/dashboard";
  if (/[\\:\r\n]/.test(path)) return "/dashboard";
  return path;
}
