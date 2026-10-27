import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shell, errText } from "@/components/shell";
import { control } from "@/components/cards";
import { listCities, listRoomWanted } from "@/lib/roomsetu/public-api";
import { openConversation } from "@/lib/roomsetu/account-api";
import { inr, whenLabel } from "@/lib/roomsetu/map";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/room-wanted")({
  component: WantedPage,
});

function WantedPage() {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [city, setCity] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listRoomWanted>>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void listCities().then((c) => setCities(c.map((x) => x.name)));
  }, []);

  useEffect(() => {
    void listRoomWanted({ data: { city, q: "" } })
      .then(setRows)
      .catch((e) => setError(errText(e)));
  }, [city]);

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">People looking</h1>
          <p className="mt-2 text-muted">Room wanted posts. Message them if you have space.</p>
        </div>
        <Link to="/create-room-wanted" className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-sm font-semibold text-card">
          Post that you need a room
        </Link>
      </div>
      <label className="mt-5 block max-w-xs">
        <span className="mb-1 block text-sm text-muted">City</span>
        <select className={control} value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">All cities</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      <ul className="mt-6 space-y-3">
        {rows.map((person) => (
          <li key={person.id} className="rounded-3xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {person.name}
                  {person.age ? <span className="font-normal text-muted"> · {person.age}</span> : null}
                  {person.isDemo ? <span className="ml-2 rounded-full bg-marigold-soft px-2 py-0.5 text-xs font-semibold">Sample</span> : null}
                </p>
                <p className="text-sm text-muted">
                  {person.occupation} · {person.city}
                  {person.localities ? ` · ${person.localities}` : ""} · {inr(person.budget)} · {person.roomPref}
                  {person.moveIn ? ` · move-in ${whenLabel(person.moveIn)}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="h-11 rounded-full border border-line px-4 text-sm font-semibold"
                onClick={() => {
                  if (!user) {
                    sessionStorage.setItem("roomsetu-next", "/room-wanted");
                    window.location.href = "/login";
                    return;
                  }
                  void openConversation({ data: { listingId: "", roomWantedId: person.id, withUserId: "" } })
                    .then((c) => navigate({ to: "/messages", search: { thread: c.id } }))
                    .catch((e) => setError(errText(e)));
                }}
              >
                Message
              </button>
            </div>
            <p className="mt-3">{person.bio}</p>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
