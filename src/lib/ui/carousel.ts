// Pure helpers for the home "Fresh beds" carousel. Testable without a DOM.

/** Which card is in front, from the scroller's scrollLeft. Clamped to [0, count - 1]. */
export function activeSlide(scrollLeft: number, step: number, count: number): number {
  if (count <= 0 || !(step > 0) || !Number.isFinite(scrollLeft)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / step)));
}

/** "2 of 4" label for screen readers and the visible counter. */
export function slideLabel(index: number, count: number): string {
  return count > 0 ? `${Math.min(count, index + 1)} of ${count}` : "";
}

/** scrollLeft that puts card `index` at the snap start. */
export function slideOffset(index: number, step: number, count: number): number {
  if (count <= 0 || !(step > 0)) return 0;
  return Math.min(count - 1, Math.max(0, Math.trunc(index))) * step;
}
