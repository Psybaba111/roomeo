import { pageHead } from "@/lib/seo";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { control } from "@/components/cards";
import { FURNISHED, GENDER_PREFS, ROOM_TYPES } from "@/lib/roomsetu/constants";
import { listCities } from "@/lib/roomsetu/public-api";
import { createRoomWanted } from "@/lib/roomsetu/account-api";

export const Route = createFileRoute("/create-room-wanted")({
  head: () => pageHead("Post a room wanted"),
  component: () => (
    <NeedAccount next="/create-room-wanted">
      <Form />
    </NeedAccount>
  ),
});

function Form() {
  const navigate = useNavigate();
  const [cities, setCities] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [cityError, setCityError] = useState("");
  const cityRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    city: "",
    localities: "",
    budget: "15000",
    moveIn: "",
    duration: "6",
    roomPref: "Private room",
    furnished: "Furnished",
    food: "ANY",
    smoking: "NO",
    pets: "NO",
    roommateGender: "ANY",
    people: "1",
    bio: "",
    lifestyle: "Quiet on weeknights",
  });

  useEffect(() => {
    void listCities().then((rows) => setCities(rows.map((c) => c.name)));
  }, []);

  return (
    <Shell>
      <h1 className="font-display text-4xl">I need a room</h1>
      <p className="mt-2 max-w-xl text-muted">Write it the way you would say it. Hosts with a spare room can message you.</p>
      <form
        className="mt-6 grid max-w-2xl gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.city.trim()) {
            setCityError("Choose or type the city you need a room in.");
            cityRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
            cityRef.current?.focus();
            return;
          }
          setCityError("");
          void createRoomWanted({
            data: {
              ...form,
              city: form.city.trim(),
              budget: Number(form.budget),
              duration: Number(form.duration),
              people: Number(form.people),
            },
          })
            .then(() => navigate({ to: "/room-wanted" }))
            .catch((err) => setError(errText(err)));
        }}
      >
        <label>
          <span className="mb-1 block text-sm text-muted">City</span>
          <input
            ref={cityRef}
            className={control}
            list="room-wanted-cities"
            placeholder="Choose a city, or type yours"
            maxLength={60}
            value={form.city}
            aria-invalid={cityError ? true : undefined}
            aria-describedby={cityError ? "city-error" : undefined}
            onChange={(e) => { setForm({ ...form, city: e.target.value }); if (cityError) setCityError(""); }}
            data-testid="room-wanted-city"
          />
          <datalist id="room-wanted-cities">
            {cities.map((c) => <option key={c} value={c} />)}
          </datalist>
          {cityError ? <p id="city-error" role="alert" className="mt-1 text-sm text-danger">{cityError}</p> : null}
        </label>
        <input className={control} placeholder="Preferred localities" value={form.localities} onChange={(e) => setForm({ ...form, localities: e.target.value })} />
        <input className={control} placeholder="Budget" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value.replace(/[^\d]/g, "") })} />
        <input className={control} type="date" value={form.moveIn} onChange={(e) => setForm({ ...form, moveIn: e.target.value })} />
        <select className={control} value={form.roomPref} onChange={(e) => setForm({ ...form, roomPref: e.target.value })}>
          {ROOM_TYPES.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select className={control} value={form.furnished} onChange={(e) => setForm({ ...form, furnished: e.target.value })}>
          {FURNISHED.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select className={control} value={form.roommateGender} onChange={(e) => setForm({ ...form, roommateGender: e.target.value })}>
          {GENDER_PREFS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <textarea className="rounded-xl border border-line bg-paper p-3" rows={5} placeholder="27 year old software engineer relocating for a new job…" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} required />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button className="h-12 rounded-full bg-brand font-semibold text-card" type="submit">Publish request</button>
      </form>
    </Shell>
  );
}
