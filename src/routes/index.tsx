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

function Home() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const [budget, setBudget] = useState("");

  return (
    <Shell>
      <section className="max-w-3xl">
        <p className="text-sm font-semibold text-pop">Bengaluru</p>
        <h1 className="mt-3 text-5xl font-semibold leading-none tracking-tight text-ink sm:text-7xl">
          ₹499.
          <span className="mt-2 block text-brand">Not a broker's month.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          People choose their own group. The owner says yes once. Each person pays their own bed. No visit. No score.
        </p>
      </section>

      <form
        className="mt-8 flex flex-col gap-3 rounded-3xl bg-card p-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void navigate({ to: "/search", search: { ...SEARCH, maxRent: budget } });
        }}
      >
        <label className="flex-1">
          <span className="mb-1 block text-sm font-medium text-muted">Your share, up to</span>
          <input
            className={control}
            inputMode="numeric"
            placeholder="15000"
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
        <button type="submit" className="h-12 rounded-full bg-brand px-6 font-semibold text-card">
          See Bengaluru beds
        </button>
        <Link to="/create-listing" className="inline-flex h-12 items-center justify-center rounded-full bg-pop px-6 font-semibold text-card">
          List a bed
        </Link>
      </form>

      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["1", "Choose the group", "You start alone, or friends arrive together. Nobody is assigned."],
          ["2", "Owner says yes once", "A finished group. One decision. An empty bed can stay empty."],
          ["3", "Pay your own bed", "₹499 once, on top. The owner pays ₹499 once. Later months are just the rent."],
        ].map(([n, title, body]) => (
          <li key={n} className="rounded-3xl bg-ink p-5 text-card">
            <p className="text-sm font-semibold text-brand">{n}</p>
            <h2 className="mt-2 text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-brand-soft">{body}</p>
          </li>
        ))}
      </ol>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="text-3xl font-semibold tracking-tight">Beds in Bengaluru</h2>
          <Link to="/search" search={SEARCH} className="text-sm font-semibold text-trust">
            All of them
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.listings.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      </section>

      <p className="mt-8 text-sm text-muted">Sample beds are marked. A chain cannot list. One person per bed. No visit.</p>
    </Shell>
  );
}
