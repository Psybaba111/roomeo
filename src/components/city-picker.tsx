import { MapPin } from "@phosphor-icons/react";
import { SEARCH_CITIES } from "@/lib/roomsetu/cities";

/** Segmented city switch. Bengaluru first and default. */
export function CityPicker({
  value,
  onChange,
  tone = "light",
  className = "",
}: {
  value: string;
  onChange: (city: string) => void;
  tone?: "light" | "dark";
  className?: string;
}) {
  const wrap =
    tone === "dark" ? "border-white/30 bg-white/10 text-white" : "border-line bg-card text-ink";
  const on = tone === "dark" ? "bg-white text-[#14111f]" : "bg-ink text-card";
  const off = tone === "dark" ? "text-white/90" : "text-muted";
  return (
    <div
      role="radiogroup"
      aria-label="City"
      className={`inline-flex rounded-full border p-1 text-sm font-semibold ${wrap} ${className}`}
    >
      {SEARCH_CITIES.map((c) => {
        const active = c.name === value;
        return (
          <button
            key={c.name}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`city-${c.name.toLowerCase()}`}
            onClick={() => onChange(c.name)}
            className={`inline-flex h-10 items-center gap-2 rounded-full px-4 ${active ? on : off}`}
          >
            <MapPin size={16} weight={active ? "fill" : "regular"} aria-hidden />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
