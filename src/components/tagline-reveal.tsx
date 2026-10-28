import { useEffect, useRef } from "react";

/**
 * Large tagline that lights up word by word as it scrolls past a trigger line
 * (design rule B11). One IntersectionObserver per word; reduced motion shows it fully lit.
 */
export function TaglineReveal({ lines, id }: { lines: string[]; id?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const words = Array.from(root.querySelectorAll<HTMLSpanElement>("[data-word]"));
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      words.forEach((w) => (w.style.opacity = "1"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.opacity = "1";
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -40% 0px", threshold: 1 },
    );
    words.forEach((w) => io.observe(w));
    return () => io.disconnect();
  }, []);
  return (
    <section className="py-24" aria-labelledby={id}>
      <p ref={ref} id={id} className="mx-auto max-w-[680px] text-4xl font-semibold tracking-tight [text-wrap:balance] md:text-5xl">
        {lines.map((line, li) => (
          <span key={li} className="block">
            {line.split(" ").map((w, wi) => (
              <span
                key={wi}
                data-word
                className="opacity-30 transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              >
                {w}{" "}
              </span>
            ))}
          </span>
        ))}
      </p>
    </section>
  );
}
