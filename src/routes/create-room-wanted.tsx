import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell, errText } from "@/components/shell";
import { control } from "@/components/cards";
import { FURNISHED, GENDER_PREFS, ROOM_TYPES } from "@/lib/roomsetu/constants";
import { listCities } from "@/lib/roomsetu/public-api";
import { createRoomWanted } from "@/lib/roomsetu/account-api";

export const Route = createFileRoute("/create-room-wanted")({
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
  const [form, setForm] = useState({
    city: "Bengaluru",
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
          void createRoomWanted({
            data: {
              ...form,
              budget: Number(form.budget),
              duration: Number(form.duration),
              people: Number(form.people),
            },
          })
            .then(() => navigate({ to: "/room-wanted" }))
            .catch((err) => setError(errText(err)));
        }}
      >
        <select className={control} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
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
        <textarea className="rounded-xl border border-line bg-paper p-3" rows={5} placeholder="27-year-old software engineer relocating to Bengaluru…" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} required />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button className="h-12 rounded-full bg-brand font-semibold text-card" type="submit">Publish request</button>
      </form>
    </Shell>
  );
}
