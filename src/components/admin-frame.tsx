import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Shell } from "@/components/shell";

const LINKS = [
  ["/admin", "Pulse"],
  ["/admin/users", "People"],
  ["/admin/listings", "Rooms"],
  ["/admin/hosts", "Hosts"],
  ["/admin/verifications", "Checks"],
  ["/admin/payments", "Payments"],
  ["/admin/reports", "Reports"],
  ["/admin/analytics", "Charts"],
] as const;

export function AdminFrame({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <Shell>
      <p className="text-sm font-semibold text-brand">Operator desk</p>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
        {LINKS.map(([href, label]) => (
          <Link
            key={href}
            to={href}
            className={`inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${path === href ? "bg-ink text-card" : "border border-line bg-card"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="mt-6">{children}</div>
    </Shell>
  );
}
