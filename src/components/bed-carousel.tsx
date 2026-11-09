import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { RoomCard } from "@/components/cards";
import { activeSlide, slideLabel, slideOffset } from "@/lib/ui/carousel";
import type { ListingCard } from "@/lib/roomsetu/map";

/**
 * Home "Fresh beds" row. Mobile-first: cards are ~80% wide so the next one peeks in,
 * scroll-snap keeps one card in front, dots + "1 of 4" show there is more.
 * Bleeds to the screen edge on phones without causing page-level horizontal scroll.
 */
export function BedCarousel({ rooms }: { rooms: ListingCard[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = rooms.length;

  const step = () => {
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-slide]");
    if (!el || !first) return 0;
    const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
    return first.offsetWidth + gap;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // At the far end the last card can't snap to start; treat "scrolled to the end" as last.
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
        setActive(atEnd ? count - 1 : activeSlide(el.scrollLeft, step(), count));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [count]);

  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: slideOffset(i, step(), count), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div data-testid="bed-carousel" role="region" aria-roledescription="carousel" aria-label="Fresh beds">
      <div
        ref={ref}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-3 no-scrollbar sm:mx-0 sm:scroll-px-0 sm:px-0"
      >
        {rooms.map((room, i) => (
          <div
            key={room.id}
            data-slide
            className="w-[80%] max-w-sm shrink-0 snap-start sm:w-[46%] lg:w-[31%]"
            role="group"
            aria-roledescription="slide"
            aria-label={slideLabel(i, count)}
          >
            <RoomCard room={room} />
          </div>
        ))}
        {/* Keeps the last card's right padding on browsers that drop end padding in overflow rows. */}
        <div aria-hidden="true" className="w-1 shrink-0 sm:hidden" />
      </div>
      {count > 1 ? (
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1" data-testid="carousel-dots">
            {rooms.map((room, i) => (
              <button
                key={room.id}
                type="button"
                aria-label={`Show bed ${slideLabel(i, count)}`}
                aria-current={i === active ? "true" : undefined}
                onClick={() => go(i)}
                className="grid h-6 w-6 place-items-center rounded-full"
              >
                <span
                  className={`block h-2 rounded-full transition-all duration-300 motion-reduce:transition-none ${i === active ? "w-5 bg-brand" : "w-2 bg-line"}`}
                />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tabular-nums text-muted" aria-live="polite" data-testid="carousel-count">
              {slideLabel(active, count)}
            </span>
            <button
              type="button"
              aria-label="Previous bed"
              disabled={active === 0}
              onClick={() => go(active - 1)}
              className="hidden h-9 w-9 place-items-center rounded-full border border-line bg-card disabled:opacity-40 sm:grid"
            >
              <CaretLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next bed"
              disabled={active >= count - 1}
              onClick={() => go(active + 1)}
              className="hidden h-9 w-9 place-items-center rounded-full border border-line bg-card disabled:opacity-40 sm:grid"
            >
              <CaretRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
