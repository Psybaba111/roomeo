import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { RoomCard, control } from "@/components/cards";
import { FURNISHED, GENDER_PREFS, ROOM_TYPES, SORTS } from "@/lib/roomsetu/constants";
import { listCities, searchListings } from "@/lib/roomsetu/public-api";
import { rememberSearch } from "@/lib/roomsetu/account-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

function textParam(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value : "";
}

export const Route = createFileRoute("/search")({
  head: () => pageHead("Search spare beds in Bengaluru"),
  validateSearch: (search: Record<string, unknown>) => ({
    city: textParam(search.city),
    locality: textParam(search.locality),
    maxRent: textParam(search.maxRent),
    roomType: textParam(search.roomType),
    furnished: textParam(search.furnished),
    gender: textParam(search.gender),
    food: textParam(search.food),
    sort: textParam(search.sort) || "recommended",
    q: textParam(search.q),
    availableBy: textParam(search.availableBy),
  }),
  component: SearchPage,
});

function SearchPage() {
  const initial = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useCurrentUserState();
  const [cities, setCities] = useState<{ name: string; localities: string[] }[]>([]);
  const [rooms, setRooms] = useState<Awaited<ReturnType<typeof searchListings>> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listCities()
      .then((all) => setCities(all.filter((c) => c.name === "Bengaluru")))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void searchListings({
      data: {
        city: "Bengaluru",
        locality: initial.locality,
        minRent: null,
        maxRent: initial.maxRent ? Number(initial.maxRent) : null,
        maxDeposit: null,
        roomType: initial.roomType,
        furnished: initial.furnished,
        gender: initial.gender,
        occupation: "",
        food: initial.food === "1",
        wifi: false,
        ac: false,
        parking: false,
        availableBy: initial.availableBy,
        propertyType: "",
        sort: initial.sort,
        q: initial.q,
      },
    })
      .then((result) => {
        if (!live) return;
        setRooms(result);
        setError("");
      })
      .catch((e) => {
        if (live) setError(errText(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [initial]);

  useEffect(() => {
    if (!user || !initial.city) return;
    void rememberSearch({ data: `${initial.city} ${initial.roomType}`.trim() }).catch(() => undefined);
  }, [user, initial.city, initial.roomType]);

  const localities = cities.find((c) => c.name === "Bengaluru")?.localities ?? [];

  function set<K extends keyof typeof initial>(key: K, value: string) {
    void navigate({ search: { ...initial, [key]: value } });
  }

  return (
    <Shell>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Bengaluru beds</h1>
          <p className="mt-1 text-muted">{loading ? "Looking…" : `${rooms?.total ?? 0} open now. One person per bed.`}</p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <form className="space-y-3 lg:col-span-3" onSubmit={(e) => e.preventDefault()}>
          <p className="rounded-2xl bg-pop-soft px-3 py-3 text-sm font-semibold text-pop">Bengaluru only. No other city is in this version.</p>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Locality</span>
            <select className={control} value={initial.locality} onChange={(e) => set("locality", e.target.value)}>
              <option value="">Any</option>
              {localities.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Max rent</span>
            <input className={control} inputMode="numeric" value={initial.maxRent} onChange={(e) => set("maxRent", e.target.value.replace(/[^\d]/g, ""))} placeholder="20000" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Room</span>
            <select className={control} value={initial.roomType} onChange={(e) => set("roomType", e.target.value)}>
              <option value="">Any</option>
              {ROOM_TYPES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Furnished</span>
            <select className={control} value={initial.furnished} onChange={(e) => set("furnished", e.target.value)}>
              <option value="">Any</option>
              {FURNISHED.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">For</span>
            <select className={control} value={initial.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">Anyone</option>
              {GENDER_PREFS.filter((g) => g.value !== "ANY").map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </label>
          <label className="flex h-12 items-center gap-2 text-sm">
            <input type="checkbox" checked={initial.food === "1"} onChange={(e) => set("food", e.target.checked ? "1" : "")} />
            Food available
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Available by</span>
            <input className={control} type="date" value={initial.availableBy} onChange={(e) => set("availableBy", e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Sort</span>
            <select className={control} value={initial.sort} onChange={(e) => set("sort", e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Words</span>
            <input className={control} value={initial.q} onChange={(e) => set("q", e.target.value)} placeholder="Whitefield, PG, studio" />
          </label>
        </form>
        <div className="lg:col-span-9">
          {error ? <p className="text-danger">{error}</p> : null}
          {loading ? <p className="text-muted">Gathering rooms…</p> : null}
          {!loading && rooms && rooms.listings.length === 0 ? (
            <p className="rounded-3xl border border-line bg-card p-6">No rooms match that. Widen the budget or clear a filter.</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {rooms?.listings.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
