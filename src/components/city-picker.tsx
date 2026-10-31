import { MapPin } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

/** Free-text city box. Empty means any city. No city is featured or preselected. */
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
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const wrap =
    tone === "dark" ? "border-white/30 bg-white/10 text-white placeholder:text-white/70" : "border-line bg-card text-ink";
  const commit = () => {
    if (text.trim() !== value) onChange(text.trim());
  };
  return (
    <label className={`inline-flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${wrap} ${className}`}>
      <MapPin size={16} weight={value ? "fill" : "regular"} aria-hidden />
      <span className="sr-only">City</span>
      <input
        data-testid="city-input"
        aria-label="City"
        className="min-w-0 flex-1 bg-transparent outline-none"
        placeholder="Any city"
        value={text}
        maxLength={60}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
    </label>
  );
}
