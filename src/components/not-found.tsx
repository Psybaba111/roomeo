import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { NOT_FOUND_COPY as c } from "@/lib/not-found-copy";

export function NotFoundPage() {
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{c.eyebrow}</p>
      <h1 className="mt-2 font-display text-4xl">{c.title}</h1>
      <p className="mt-3 max-w-md text-muted">{c.body}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to={c.primary.to}
          className="inline-flex h-12 items-center rounded-lg bg-ink px-4 font-semibold text-card shadow-[0_4px_0_var(--color-brand)]"
        >
          {c.primary.label}
        </Link>
      </div>
    </Shell>
  );
}
