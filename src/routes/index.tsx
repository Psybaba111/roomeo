import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { RoomCard, control } from "@/components/cards";
import { getHome } from "@/lib/roomsetu/public-api";

export const Route = createFileRoute("/")({
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
  ["01", "Choose", "You pick the group. Nobody is assigned to you."],
  ["02", "Yes, once", "The owner decides once. An empty bed can stay empty."],
  ["03", "Pay your bed", "₹499 once. Later months are just the rent."],
];

function Home() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const [budget, setBudget] = useState("");

  return (
    <Shell>
      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-brand px-5 pb-12 pt-10 text-card">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 46px)",
          }}
        />
        <div className="relative mx-auto max-w-6xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Bengaluru only</p>
          <h1 className="mt-3 max-w-xl text-[2.6rem] leading-[1.02] text-card sm:text-7xl">
            ₹499.
            <span className="mt-1 block text-transparent" style={{ WebkitTextStroke: "3px #fff" }}>
              Not a broker's month.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/85">
            People choose their own group. The owner says yes once. Each person pays their own bed. No visit. No score.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/search"
              search={SEARCH}
              className="inline-flex h-12 items-center rounded-lg bg-ink px-5 text-[15px] font-semibold text-card shadow-[0_4px_0_rgba(0,0,0,0.35)]"
            >
              See the beds →
            </Link>
            <Link
              to="/create-listing"
              className="inline-flex h-12 items-center rounded-lg bg-card px-5 text-[15px] font-semibold text-ink shadow-[0_4px_0_rgba(0,0,0,0.25)]"
            >
              List a bed →
            </Link>
          </div>
        </div>
      </section>

      <section className="relative left-1/2 w-screen -translate-x-1/2 border-b border-line bg-card">
        <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {[
            ["₹499", "Once. Not every month."],
            ["One yes", "The owner decides once."],
            ["No visit", "The close stays on the phone."],
            ["No score", "You choose. We do not rank you."],
          ].map(([k, v]) => (
            <li key={k} className="bg-card px-5 py-5">
              <p className="font-display text-2xl text-brand">{k}</p>
              <p className="mt-1 text-sm text-muted">{v}</p>
            </li>
          ))}
        </ul>
      </section>

      <form
        className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void navigate({ to: "/search", search: { ...SEARCH, maxRent: budget } });
        }}
      >
        <label className="flex-1">
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-brand">Your share, up to</span>
          <input
            className={control}
            inputMode="numeric"
            placeholder="15000"
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
        <button type="submit" className="h-12 rounded-lg bg-ink px-5 font-semibold text-card shadow-[0_4px_0_#ff3d8a]">
          Show beds →
        </button>
      </form>

      <section className="mt-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand">How the close works</p>
        <h2 className="mt-2 text-4xl">Three steps. Then you live there.</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map(([n, title, body]) => (
            <li key={n} className="rounded-[14px] border border-line bg-card p-5 shadow-[8px_8px_0_#ff3d8a]">
              <p className="font-display text-sm text-brand">{n}</p>
              <h3 className="mt-3 text-2xl">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#444]">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand">Slide to look</p>
            <h2 className="mt-1 text-4xl">Beds in Bengaluru</h2>
          </div>
          <Link to="/search" search={SEARCH} className="text-sm font-semibold">
            All of them →
          </Link>
        </div>
        <div className="flex snap-x gap-4 overflow-x-auto pb-4 no-scrollbar">
          {data.listings.map((room) => (
            <div key={room.id} className="w-[78%] max-w-sm shrink-0 snap-start">
              <RoomCard room={room} />
            </div>
          ))}
        </div>
        <p className="text-sm text-muted">Sample beds are marked. A chain cannot list. One person per bed. No visit.</p>
      </section>
    </Shell>
  );
}