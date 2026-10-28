import { ChatCircle, Flag, MapPin, ShieldCheck } from "@phosphor-icons/react";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { RoomCard } from "@/components/cards";
import { EmptyBeds } from "@/components/empty-beds";
import { getHome, listCities } from "@/lib/roomsetu/public-api";
import { CityPicker } from "@/components/city-picker";
import { DEFAULT_CITY, cityInfo } from "@/lib/roomsetu/cities";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead("Spare beds in Bengaluru & Mangaluru for students & first jobbers", {
      description:
        "Shared rooms, PG beds and whole flats in Bengaluru and Mangaluru. Pick your flatmates and message 3 owners free.",
    }),
  loader: () => getHome({ data: { city: DEFAULT_CITY } }),
  component: Home,
});

const SEARCH = {
  city: "Bengaluru",
  locality: "",
  maxRent: "",
  roomType: "",
  furnished: "",
  gender: "",
  food: "",
  kind: "",
  sort: "recommended",
  q: "",
  availableBy: "",
};

const STEPS = [
  [
    "01",
    "Pick your people",
    "Choose your own flatmates. No random allotment, no awkward surprises.",
  ],
  ["02", "Owner says yes once", "One clear yes or no. No endless calls, no ghosting."],
  ["03", "Message 3 owners free", "Your first 3 owner chats cost nothing. After that a pass from ₹149 a week."],
];

const TRUST: [typeof ShieldCheck, string, string][] = [
  [ShieldCheck, "ID + phone checked", "Hosts verify phone and ID before a bed goes live."],
  [MapPin, "Address stays private", "Exact address only after the owner says yes."],
  [ChatCircle, "Chat inside roomeo", "Your number stays hidden till you're ready."],
  [Flag, "Report in one tap", "Something feels off? Flag it. A real person reviews it."],
];

function Home() {
  const initialData = Route.useLoaderData();
  const [data, setData] = useState(initialData);
  const [city, setCity] = useState(initialData.city || DEFAULT_CITY);
  const navigate = useNavigate();
  const [budget, setBudget] = useState("");
  const [area, setArea] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const search = { ...SEARCH, city };

  useEffect(() => {
    void listCities()
      .then((all) => setAreas(all.find((c) => c.name === city)?.localities ?? []))
      .catch(() => undefined);
    if (city === initialData.city) {
      setData(initialData);
      return;
    }
    let live = true;
    void getHome({ data: { city } })
      .then((next) => live && setData(next))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [city, initialData]);

  return (
    <Shell>
      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[#2a0a4a] px-4 pb-12 pt-10 text-white">
        <div className="relative mx-auto max-w-6xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-lime" aria-hidden /> {city} · for students &
            first jobbers
          </p>
          <CityPicker
            value={city}
            tone="dark"
            className="mt-4 flex w-fit"
            onChange={(next) => {
              setCity(next);
              setArea("");
            }}
          />
          <h1 className="mt-4 max-w-2xl text-4xl leading-[1.02] sm:text-7xl">
            Find your people.
            <span className="block text-lime">Then your bed.</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/90">
            Spare beds near college and office. Pick your flatmates and message 3 owners free. No
            broker's month, no cut of your rent.
          </p>
          <form
            className="mt-6 grid max-w-2xl gap-2 rounded-3xl bg-white p-2 text-[#14111f] shadow-xl sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void navigate({
                to: "/search",
                search: { ...search, locality: area, maxRent: budget },
              });
            }}
          >
            <label className="flex flex-col rounded-2xl px-3 py-2 focus-within:bg-[#f7f5ff]">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#5b5670]">
                Area
              </span>
              <select
                aria-label="Area"
                className="bg-transparent text-base font-semibold outline-none"
                value={area}
                onChange={(e) => setArea(e.target.value)}
              >
                <option value="">Anywhere in {city}</option>
                {areas.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col rounded-2xl px-3 py-2 focus-within:bg-[#f7f5ff]">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#5b5670]">
                Budget / month
              </span>
              <input
                aria-label="Budget per month"
                className="bg-transparent text-base font-semibold outline-none placeholder:text-[#5b5670]"
                inputMode="numeric"
                placeholder="₹ up to 15,000"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
              />
            </label>
            <button
              type="submit"
              className="h-14 rounded-2xl bg-[#d1006b] px-6 text-base font-bold text-white"
            >
              Find beds →
            </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {[
              ["Under ₹10k", "10000"],
              ["Under ₹15k", "15000"],
              ["Under ₹20k", "20000"],
            ].map(([label, v]) => (
              <Link
                key={v}
                to="/search"
                search={{ ...search, maxRent: v }}
                className="rounded-full border border-white/40 px-3 py-2 font-semibold text-white hover:bg-white/10"
              >
                {label}
              </Link>
            ))}
            <Link
              to="/create-listing"
              className="rounded-full bg-white/15 px-3 py-2 font-semibold text-white hover:bg-white/25"
            >
              Got a spare bed? List it
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="safe">
        <h2 id="safe" className="text-2xl sm:text-3xl">
          Safe by default, not as an add-on
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(([Icon, k, v]) => (
            <li key={k} className="rounded-3xl border border-line bg-card p-4">
              <Icon size={28} weight="duotone" className="text-brand" aria-hidden />
              <p className="mt-2 font-display text-lg">{k}</p>
              <p className="mt-1 text-sm text-muted">{v}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Swipe karo</p>
            <h2 className="mt-1 text-3xl sm:text-4xl">Fresh beds in {city}</h2>
            <p className="mt-1 text-sm text-muted">{cityInfo(city).tagline}</p>
          </div>
          <Link to="/search" search={search} className="text-sm font-semibold text-brand">
            See all →
          </Link>
        </div>
        {data.listings.length === 0 ? (
          <EmptyBeds area={city} />
        ) : (
          <div className="flex snap-x gap-4 overflow-x-auto pb-4 no-scrollbar">
            {data.listings.map((room) => (
              <div key={room.id} className="w-[82%] max-w-sm shrink-0 snap-start">
                <RoomCard room={room} />
              </div>
            ))}
          </div>
        )}
        {data.listings.some((r) => r.isDemo) ? (
          <p className="text-sm text-muted">
            Beds tagged Demo are samples so you can try the flow.
          </p>
        ) : null}
      </section>

      <section className="mt-12">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">How it works</p>
        <h2 className="mt-2 text-3xl sm:text-4xl">Three steps. Zero broker drama.</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map(([n, title, body]) => (
            <li key={n} className="rounded-3xl border border-line bg-card p-6">
              <p className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft font-display text-sm text-brand-deep">
                {n}
              </p>
              <h3 className="mt-3 text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </Shell>
  );
}
