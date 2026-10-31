import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { RoomCard, control } from "@/components/cards";
import { FURNISHED, GENDER_PREFS, ROOM_TYPES, SORTS } from "@/lib/roomsetu/constants";
import { listAreaCentroids, listCities, searchListings } from "@/lib/roomsetu/public-api";
import { areaPins, type Centroid } from "@/lib/roomsetu/area-pins";
import { AreaMap } from "@/components/area-map";
import { EmptyBeds } from "@/components/empty-beds";
import { RoomGridSkeleton } from "@/components/skeletons";
import { rememberSearch } from "@/lib/roomsetu/account-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { CityPicker } from "@/components/city-picker";
import { cityInfo, citySeoDescription, citySeoTitle, searchCity } from "@/lib/roomsetu/cities";

function textParam(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value : "";
}

export const Route = createFileRoute("/search")({
  head: ({ match }) => {
    const city = searchCity((match.search as { city?: string } | undefined)?.city);
    return pageHead(citySeoTitle(city), { description: citySeoDescription(city) });
  },
  validateSearch: (search: Record<string, unknown>) => ({
    city: searchCity(textParam(search.city)),
    locality: textParam(search.locality),
    maxRent: textParam(search.maxRent),
    roomType: textParam(search.roomType),
    furnished: textParam(search.furnished),
    gender: textParam(search.gender),
    food: textParam(search.food),
    kind: textParam(search.kind),
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
  const [view, setView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [centroids, setCentroids] = useState<Centroid[]>([]);

  const city = searchCity(initial.city);
  const info = cityInfo(city);

  useEffect(() => {
    void listAreaCentroids({ data: { city } })
      .then(setCentroids)
      .catch(() => undefined);
  }, [city]);

  useEffect(() => {
    void listCities()
      .then((all) => setCities(all))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void searchListings({
      data: {
        city,
        locality: initial.locality,
        minRent: null,
        maxRent: initial.maxRent ? Number(initial.maxRent) : null,
        maxDeposit: null,
        roomType: initial.roomType,
        furnished: initial.furnished,
        gender: initial.gender,
        occupation: "",
        food: initial.food === "1",
        entireFlat: initial.kind === "flat",
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
  }, [initial, city]);

  useEffect(() => {
    if (!user || !initial.city) return;
    void rememberSearch({ data: `${initial.city} ${initial.roomType}`.trim() }).catch(
      () => undefined,
    );
  }, [user, initial.city, initial.roomType]);

  const localities = cities.find((c) => c.name === city)?.localities ?? [];

  const activeFilters = (
    ["locality", "maxRent", "roomType", "furnished", "gender", "food", "kind", "availableBy", "q"] as const
  ).filter((k) => initial[k]).length;

  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFiltersOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  function set<K extends keyof typeof initial>(key: K, value: string) {
    void navigate({ search: { ...initial, [key]: value } });
  }

  function pickCity(next: string) {
    if (next === city) return;
    void navigate({ search: { ...initial, city: next, locality: "" } });
  }

  return (
    <Shell>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4 pt-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{city} beds</h1>
          <p className="mt-1 text-muted">
            {loading
              ? "Finding your people…"
              : `${rooms?.total ?? 0} beds open now. ${info.tagline}.`}
          </p>
        </div>
        <CityPicker value={city} onChange={pickCity} />
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        {filtersOpen ? (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-hidden="true"
            onClick={() => setFiltersOpen(false)}
          />
        ) : null}
        <form
          id="search-filters"
          aria-label="Filters"
          className={`${filtersOpen ? "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-line bg-card p-4 pb-8 shadow-2xl" : "hidden"} space-y-3 lg:static lg:z-auto lg:col-span-3 lg:block lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
          onSubmit={(e) => {
            e.preventDefault();
            setFiltersOpen(false);
          }}
        >
          <div className="flex items-center justify-between lg:hidden">
            <h2 className="text-xl font-semibold">Filters</h2>
            <button
              type="button"
              className="rounded-full border border-line px-3 py-1 text-sm"
              onClick={() => setFiltersOpen(false)}
              aria-label="Close filters"
            >
              Close
            </button>
          </div>
          <div className="block">
            <span className="mb-1 block text-sm text-muted">City</span>
            <CityPicker value={city} onChange={pickCity} className="w-full justify-between [&>button]:flex-1 [&>button]:justify-center" />
          </div>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Locality</span>
            <select
              className={control}
              value={initial.locality}
              onChange={(e) => set("locality", e.target.value)}
            >
              <option value="">Any</option>
              {localities.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Max rent</span>
            <input
              className={control}
              inputMode="numeric"
              value={initial.maxRent}
              onChange={(e) => set("maxRent", e.target.value.replace(/[^\d]/g, ""))}
              placeholder="20000"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Room</span>
            <select
              className={control}
              value={initial.roomType}
              onChange={(e) => set("roomType", e.target.value)}
            >
              <option value="">Any</option>
              {ROOM_TYPES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Furnished</span>
            <select
              className={control}
              value={initial.furnished}
              onChange={(e) => set("furnished", e.target.value)}
            >
              <option value="">Any</option>
              {FURNISHED.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">For</span>
            <select
              className={control}
              value={initial.gender}
              onChange={(e) => set("gender", e.target.value)}
            >
              <option value="">Anyone</option>
              {GENDER_PREFS.filter((g) => g.value !== "ANY").map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-12 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={initial.food === "1"}
              onChange={(e) => set("food", e.target.checked ? "1" : "")}
            />
            Food available
          </label>
          <label className="flex h-12 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={initial.kind === "flat"}
              onChange={(e) => set("kind", e.target.checked ? "flat" : "")}
              data-testid="filter-entire-flat"
            />
            Entire flats only
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Available by</span>
            <input
              className={control}
              type="date"
              value={initial.availableBy}
              onChange={(e) => set("availableBy", e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Sort</span>
            <select
              className={control}
              value={initial.sort}
              onChange={(e) => set("sort", e.target.value)}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Words</span>
            <input
              className={control}
              value={initial.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder="Area, PG, AC"
            />
          </label>
          <button
            type="submit"
            className="h-12 w-full rounded-full bg-ink font-semibold text-card lg:hidden"
          >
            Show {rooms?.total ?? 0} beds
          </button>
        </form>
        <div className="lg:col-span-9">
          {error ? <p className="text-danger">{error}</p> : null}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold lg:hidden"
              aria-expanded={filtersOpen}
              aria-controls="search-filters"
              onClick={() => setFiltersOpen(true)}
            >
              Filters
              {activeFilters ? (
                <span className="rounded-full bg-pop px-2 text-xs text-card">{activeFilters}</span>
              ) : null}
            </button>
            <div
              role="tablist"
              aria-label="View"
              className="inline-flex rounded-full border border-line bg-card p-1 text-sm font-semibold"
            >
              {(["list", "map"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  type="button"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-full px-4 py-2 ${view === v ? "bg-ink text-card" : "text-muted"}`}
                >
                  {v === "list" ? "List" : "Map"}
                </button>
              ))}
            </div>
          </div>
          {view === "map" && rooms ? (
            <div className="mb-4">
              <AreaMap
                pins={areaPins(rooms.listings, centroids)}
                center={info.center}
                onPick={(locality) => set("locality", locality)}
              />
            </div>
          ) : null}
          {loading ? <RoomGridSkeleton /> : null}
          {!loading && rooms && rooms.listings.length === 0 ? (
            activeFilters ? (
              <div className="space-y-3">
                <p className="rounded-3xl border border-line bg-card p-4 text-sm">
                  No beds match those filters. Widen the budget or clear a filter.
                </p>
                <EmptyBeds area={initial.locality || city} compact />
              </div>
            ) : (
              <EmptyBeds area={city} />
            )
          ) : null}
          {!loading && rooms && rooms.listings.length > 0 && rooms.listings.length < 3 ? (
            <div className="mt-4">
              <EmptyBeds area={initial.locality || "your area"} compact />
            </div>
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
