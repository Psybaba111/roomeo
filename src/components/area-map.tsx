import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { pinLabel, type Pin } from "@/lib/roomsetu/area-pins";

const BENGALURU: [number, number] = [12.9716, 77.5946];

/** Area-level pins only (locality centroids, ~1 km rounding). Leaflet loads in the browser only. */
export function AreaMap({ pins, onPick }: { pins: Pin[]; onPick?: (locality: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false }).setView(BENGALURU, 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 15,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const bounds: [number, number][] = [];
      for (const p of pins) {
        bounds.push([p.lat, p.lng]);
        L.circleMarker([p.lat, p.lng], {
          radius: Math.min(26, 10 + p.count * 2),
          color: "#d1006b",
          weight: 2,
          fillColor: "#ff6aa9",
          fillOpacity: 0.55,
        })
          .addTo(map)
          .bindTooltip(pinLabel(p))
          .on("click", () => pickRef.current?.(p.locality));
      }
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [pins]);
  return (
    <div>
      <div ref={el} className="h-[420px] w-full overflow-hidden rounded-3xl border border-line bg-card" role="region" aria-label="Map of areas with open beds" />
      <p className="mt-2 text-xs text-muted">📍 Pins show the area only. Exact addresses stay private till the owner says yes.</p>
    </div>
  );
}
