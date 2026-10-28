import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { RoomCard } from "@/components/cards";
import { EmptyBeds } from "@/components/empty-beds";
import { getHome, listCities } from "@/lib/roomsetu/public-api";

export const Route = createFileRoute("/")({
  head: () => pageHead("Spare beds in Bengaluru for students & first-jobbers"),
  loader: () => getHome(),
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
  ["03", "Pay ₹499, move in", "One-time fee, not a broker's month. After that it's just rent."],
];

const TRUST = [
  ["🔒", "ID + phone checked", "Hosts verify phone and ID before a bed goes live."],
  ["📍", "Address stays private", "Exact address only after the owner says yes."],
  ["💬", "Chat inside roomeo", "Your number stays hidden till you're ready."],
  ["🚩", "Report in one tap", "Something feels off? Flag it. A real person reviews it."],
];

function Home() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const [budget, setBudget] = useState("");
  const [area, setArea] = useState("");
  const [areas, setAreas] = useState<string[]>([]);

  useEffect(() => {
    void listCities()
      .then((all) => setAreas(all.find((c) => c.name === "Bengaluru")?.localities ?? []))
      .catch(() => undefined);
  }, []);

  return (
    <Shell>
      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-gradient-to-br from-[#2a0a4a] via-[#5b21b6] to-[#d1006b] px-5 pb-14 pt-10 text-white">
        <div className="relative mx-auto max-w-6xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-lime" aria-hidden /> Bengaluru · for students &
            first-jobbers
          </p>
          <h1 className="mt-4 max-w-2xl text-[2.6rem] leading-[1.02] sm:text-7xl">
            Find your people.
            <span className="block text-lime">Then your bed.</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/90">
            Spare beds near college and office. Pick your flatmates, the owner says yes once, you
            pay ₹499. Not a broker's month. Simple.
          </p>
          <form
            className="mt-7 grid max-w-2xl gap-2 rounded-3xl bg-white p-2 text-[#14111f] shadow-xl sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void navigate({
                to: "/search",
                search: { ...SEARCH, locality: area, maxRent: budget },
              });
            }}
          >
            <label className="flex flex-col rounded-2xl px-3 py-2 focus-within:bg-[#f7f5ff]">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5b5670]">
                Area
              </span>
              <select
                aria-label="Area"
                className="bg-transparent text-base font-semibold outline-none"
                value={area}
                onChange={(e) => setArea(e.target.value)}
              >
                <option value="">Anywhere in Bengaluru</option>
                {areas.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col rounded-2xl px-3 py-2 focus-within:bg-[#f7f5ff]">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5b5670]">
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
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            {[
              ["Under ₹10k", "10000"],
              ["Under ₹15k", "15000"],
              ["Under ₹20k", "20000"],
            ].map(([label, v]) => (
              <Link
                key={v}
                to="/search"
                search={{ ...SEARCH, maxRent: v }}
                className="rounded-full border border-white/40 px-3 py-1.5 font-semibold text-white hover:bg-white/10"
              >
                {label}
              </Link>
            ))}
            <Link
              to="/create-listing"
              className="rounded-full bg-white/15 px-3 py-1.5 font-semibold text-white hover:bg-white/25"
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
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(([icon, k, v]) => (
            <li key={k} className="rounded-3xl border border-line bg-card p-5">
              <p className="text-2xl" aria-hidden>
                {icon}
              </p>
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
            <h2 className="mt-1 text-3xl sm:text-4xl">Fresh beds in Bengaluru</h2>
          </div>
          <Link to="/search" search={SEARCH} className="text-sm font-semibold text-brand">
            See all →
          </Link>
        </div>
        {data.listings.length === 0 ? (
          <EmptyBeds area="Bengaluru" />
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
