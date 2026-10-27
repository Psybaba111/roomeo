import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell, errText } from "@/components/shell";
import { control } from "@/components/cards";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { ensureProfile, getDesk, updateProfile } from "@/lib/roomsetu/account-api";
import { FURNISHED, ROOM_TYPES } from "@/lib/roomsetu/constants";
import { listCities } from "@/lib/roomsetu/public-api";

export const Route = createFileRoute("/profile")({
  component: () => (
    <NeedAccount next="/profile">
      <ProfilePage />
    </NeedAccount>
  ),
});

function ProfilePage() {
  const { user } = useCurrentUserState();
  const [cities, setCities] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    age: "",
    gender: "",
    city: "",
    occupation: "",
    intent: "BOTH",
    preferredCities: "",
    about: "",
    lifestyle: "",
    smoking: "NO",
    pets: "NO",
    food: "ANY",
    budget: "",
    moveIn: "",
    roomPref: "",
    furnishedPref: "",
    showAge: true,
    showOccupation: true,
    showCity: true,
    allowMessages: "EVERYONE",
    verification: "",
  });

  useEffect(() => {
    void listCities().then((rows) => setCities(rows.map((c) => c.name)));
  }, []);

  useEffect(() => {
    if (!user) return;
    void ensureProfile({ data: { intent: "BOTH" } })
      .then(() => getDesk())
      .then((desk) => {
        const p = desk.profile;
        setForm({
          name: p.name,
          mobile: p.mobile,
          age: p.age ? String(p.age) : "",
          gender: p.gender,
          city: p.city,
          occupation: p.occupation,
          intent: p.intent,
          preferredCities: p.preferredCities,
          about: p.about,
          lifestyle: p.lifestyle,
          smoking: p.smoking,
          pets: p.pets,
          food: p.food,
          budget: p.budget ? String(p.budget) : "",
          moveIn: p.moveIn,
          roomPref: p.roomPref,
          furnishedPref: p.furnishedPref,
          showAge: p.showAge,
          showOccupation: p.showOccupation,
          showCity: p.showCity,
          allowMessages: p.allowMessages,
          verification: p.verification,
        });
      })
      .catch((e) => setError(errText(e)));
  }, [user]);

  return (
    <Shell>
      <h1 className="font-display text-4xl">Profile</h1>
      <p className="mt-2 text-sm text-muted">Verification: {form.verification || "…"}. What you hide stays off public cards.</p>
      <form
        className="mt-6 grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved("");
          const { verification: _verification, ...rest } = form;
          void updateProfile({
            data: {
              ...rest,
              age: form.age ? Number(form.age) : null,
              budget: form.budget ? Number(form.budget) : null,
            },
          })
            .then(() => setSaved("Saved."))
            .catch((err) => setError(errText(err)));
        }}
      >
        <label><span className="mb-1 block text-sm text-muted">Name</span><input className={control} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label><span className="mb-1 block text-sm text-muted">Mobile (never shown on listings)</span><input className={control} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></label>
        <label><span className="mb-1 block text-sm text-muted">Age</span><input className={control} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></label>
        <label>
          <span className="mb-1 block text-sm text-muted">Gender</span>
          <select className={control} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">Prefer not to say</option>
            <option value="F">Woman</option>
            <option value="M">Man</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">City</span>
          <select className={control} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
            <option value="">Choose</option>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label><span className="mb-1 block text-sm text-muted">Occupation</span><input className={control} value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} /></label>
        <label>
          <span className="mb-1 block text-sm text-muted">I am</span>
          <select className={control} value={form.intent} onChange={(e) => setForm({ ...form, intent: e.target.value })}>
            <option value="LOOKING">Looking for a room</option>
            <option value="OFFERING">Offering a room</option>
            <option value="BOTH">Both</option>
          </select>
        </label>
        <label><span className="mb-1 block text-sm text-muted">Budget</span><input className={control} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value.replace(/[^\d]/g, "") })} /></label>
        <label>
          <span className="mb-1 block text-sm text-muted">Room preference</span>
          <select className={control} value={form.roomPref} onChange={(e) => setForm({ ...form, roomPref: e.target.value })}>
            <option value="">Any</option>
            {ROOM_TYPES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Furnished</span>
          <select className={control} value={form.furnishedPref} onChange={(e) => setForm({ ...form, furnishedPref: e.target.value })}>
            <option value="">Any</option>
            {FURNISHED.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="md:col-span-2"><span className="mb-1 block text-sm text-muted">About me</span><textarea className="w-full rounded-xl border border-line bg-paper p-3" rows={4} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} /></label>
        <label className="md:col-span-2"><span className="mb-1 block text-sm text-muted">Lifestyle</span><input className={control} value={form.lifestyle} onChange={(e) => setForm({ ...form, lifestyle: e.target.value })} /></label>
        <div className="flex flex-col gap-2 text-sm md:col-span-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.showAge} onChange={(e) => setForm({ ...form, showAge: e.target.checked })} /> Show age</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.showOccupation} onChange={(e) => setForm({ ...form, showOccupation: e.target.checked })} /> Show occupation</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.showCity} onChange={(e) => setForm({ ...form, showCity: e.target.checked })} /> Show city</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.allowMessages === "EVERYONE"} onChange={(e) => setForm({ ...form, allowMessages: e.target.checked ? "EVERYONE" : "NONE" })} /> Allow messages</label>
        </div>
        {error ? <p className="text-sm text-danger md:col-span-2">{error}</p> : null}
        {saved ? <p className="text-sm text-brand md:col-span-2">{saved}</p> : null}
        <button className="h-12 rounded-full bg-brand font-semibold text-card" type="submit">Save profile</button>
      </form>
      <button type="button" className="mt-6 text-sm text-muted underline" onClick={() => void signOut("/").catch(() => setError("Could not sign out. Try again."))}>
        Sign out
      </button>
    </Shell>
  );
}
