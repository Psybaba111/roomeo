import { useEffect, useRef, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

/**
 * Bottom sheet / dialog used for the listing page's secondary actions
 * (trial nights, report, overflow menu). No dependency: a fixed overlay, a
 * card that slides up on phones and centres on desktop, and Escape / backdrop /
 * close-button dismissal with the body scroll locked while it is open.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  testId,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testId?: string;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="presentation">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        data-testid={testId}
        className="relative flex max-h-[85vh] w-full min-w-0 flex-col overflow-y-auto rounded-t-3xl border border-line bg-card p-4 pb-8 shadow-2xl outline-none md:max-w-lg md:rounded-3xl md:pb-4"
      >
        <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
          <h2 id={labelledBy} className="min-w-0 truncate font-display text-xl">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid={testId ? `${testId}-close` : undefined}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-card"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
