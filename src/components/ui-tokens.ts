// Shared classes for new UI (squads, contact unlock, refunds) following the
// landing-page-design rules: spacing set, Tailwind type scale, base curve, full states.
const motion =
  "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity";
const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const press =
  "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";

export const btnPrimary = `inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 py-2 text-base font-semibold text-card hover:opacity-90 ${motion} ${focus} ${press}`;
export const btnDark = `inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 py-2 text-base font-semibold text-card hover:opacity-90 ${motion} ${focus} ${press}`;
export const btnSecondary = `inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line bg-card px-6 py-2 text-base font-semibold hover:opacity-80 ${motion} ${focus} ${press}`;
export const btnSmall = `inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold hover:opacity-80 ${motion} ${focus} ${press}`;
export const btnSmallPrimary = `inline-flex h-10 items-center justify-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-card hover:opacity-90 ${motion} ${focus} ${press}`;
export const btnDanger = `inline-flex h-10 items-center justify-center gap-2 rounded-full border border-danger bg-card px-4 py-2 text-sm font-semibold text-danger hover:opacity-80 ${motion} ${focus} ${press}`;
export const linkCls = `font-semibold text-brand underline-offset-4 hover:underline ${focus}`;
export const input = `h-12 w-full rounded-full border border-line bg-card px-4 text-base ${focus}`;
/** Outer card: rounded-3xl (24px) with 16px padding, so nested boxes use rounded-lg (24 − 16 = 8). */
export const card = "rounded-3xl border border-line bg-card p-4";
export const inner = "rounded-lg bg-paper p-3";
export const errorBox = "rounded-lg border border-danger p-3 text-sm text-danger";
export const skeleton = "animate-pulse rounded-lg bg-paper motion-reduce:animate-none";
