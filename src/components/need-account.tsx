import type { ReactNode } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Shell } from "@/components/shell";

export function NeedAccount({ next, children }: { next: string; children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <Shell>
        <p className="text-muted">Checking your session…</p>
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <h1 className="font-display text-4xl">Sign in to continue</h1>
        <p className="mt-2 max-w-md text-muted">roomeo.com keeps enquiries, saved rooms, and your listings on your account.</p>
        <button
          type="button"
          className="mt-4 h-12 rounded-full bg-brand px-4 font-semibold text-card"
          onClick={() => {
            sessionStorage.setItem("roomsetu-next", next);
            window.location.href = "/login";
          }}
        >
          Sign in
        </button>
      </Shell>
    );
  }
  return <>{children}</>;
}
