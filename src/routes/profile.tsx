import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { ChangePassword } from "@/components/change-password";
import { errText } from "@/lib/ui-text";
import { control } from "@/components/cards";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { ensureProfile, getDesk, updateProfile } from "@/lib/roomsetu/account-api";
import { FURNISHED, ROOM_TYPES } from "@/lib/roomsetu/constants";
import { numField, digitsOnly, toNumberOrNull } from "@/lib/roomsetu/profile-form";
import { listCities } from "@/lib/roomsetu/public-api";
import { canSave, formLocked, loadErrorMessage, saveButtonLabelFor, type LoadState } from "@/lib/roomsetu/profile-load";
import { clearSaved, initialSaveStatus, isSaving, markSaved, saveButtonLabel, savedRemainingMs, saveStatusText, type SaveStatus } from "@/lib/roomsetu/save-status";

export const Route = createFileRoute("/profile")({
  head: () => pageHead("Your profile", { noindex: true }),
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
  const [status, setStatus] = useState<SaveStatus>(() => initialSaveStatus());

  useEffect(() => {
    if (status.kind !== "saved") return;
    const t = setTimeout(() => {
      clearSaved();
      setStatus({ kind: "idle" });
    }, savedRemainingMs() || 1);
    return () => clearTimeout(t);
  }, [status]);
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

  const userId = user?.id;
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    setLoad({ kind: "loading" });
    void ensureProfile({ data: { intent: "BOTH" } })
      .then(() => getDesk())
      .then((desk) => {
        if (!live) return;
        const p = desk.profile;
        setForm({
          name: p.name,
          mobile: p.mobile,
          age: numField(p.age),
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
          budget: numField(p.budget),
          moveIn: p.moveIn,
          roomPref: p.roomPref,
          furnishedPref: p.furnishedPref,
          showAge: p.showAge,
          showOccupation: p.showOccupation,
          showCity: p.showCity,
          allowMessages: p.allowMessages,
          verification: p.verification,
        });
        setLoad({ kind: "loaded" });
      })
      .catch((e) => {
        if (live) setLoad({ kind: "failed", reason: errText(e) });
      });
    return () => {
      live = false;
    };
    // Keyed on the id (and retry) only: re-running on every render reset what was typed.
  }, [userId, loadAttempt]);

  return (
    <Shell>
      <h1 className="font-display text-4xl">Profile</h1>
      <p className="mt-2 text-sm text-muted">Verification: {form.verification || "…"}. What you hide stays off public cards.</p>
      <form
        className="mt-6 grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          // Never save before the stored profile has loaded: the form still holds empty defaults.
          if (!canSave(load) || isSaving(status)) return;
          setError("");
          clearSaved();
          setStatus({ kind: "saving" });
          const { verification: _verification, ...rest } = form;
          void updateProfile({
            data: {
              ...rest,
              age: toNumberOrNull(form.age),
              budget: toNumberOrNull(form.budget),
            },
          })
            .then(() => {
              markSaved();
              setStatus({ kind: "saved" });
            })
            .catch((err) => setStatus({ kind: "error", reason: errText(err) }));
        }}
      >
        {load.kind === "loading" ? <p role="status" className="animate-pulse text-sm text-muted md:col-span-2">Loading your profile…</p> : null}
        {load.kind === "failed" ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger md:col-span-2">
            <span>{loadErrorMessage(load.reason)}</span>
            <button type="button" className="rounded-full border border-danger px-3 py-1 font-semibold" onClick={() => setLoadAttempt((n) => n + 1)}>Retry</button>
          </div>
        ) : null}
        <fieldset disabled={formLocked(load)} aria-busy={load.kind === "loading"} className={`contents ${formLocked(load) ? "[&_input]:opacity-60 [&_select]:opacity-60 [&_textarea]:opacity-60" : ""}`}>
        <label><span className="mb-1 block text-sm text-muted">Name</span><input className={control} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
        <label><span className="mb-1 block text-sm text-muted">Mobile (never shown on listings)</span><input className={control} value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} /></label>
        <label><span className="mb-1 block text-sm text-muted">Age</span><input className={control} inputMode="numeric" value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: digitsOnly(e.target.value) }))} /></label>
        <label>
          <span className="mb-1 block text-sm text-muted">Gender</span>
          <select className={control} value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
            <option value="">Prefer not to say</option>
            <option value="F">Woman</option>
            <option value="M">Man</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">City</span>
          <select className={control} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}>
            <option value="">Choose</option>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label><span className="mb-1 block text-sm text-muted">Occupation</span><input className={control} value={form.occupation} onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))} /></label>
        <label>
          <span className="mb-1 block text-sm text-muted">I am</span>
          <select className={control} value={form.intent} onChange={(e) => setForm((f) => ({ ...f, intent: e.target.value }))}>
            <option value="LOOKING">Looking for a room</option>
            <option value="OFFERING">Offering a room</option>
            <option value="BOTH">Both</option>
          </select>
        </label>
        <label><span className="mb-1 block text-sm text-muted">Budget</span><input className={control} inputMode="numeric" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: digitsOnly(e.target.value) }))} /></label>
        <label>
          <span className="mb-1 block text-sm text-muted">Room preference</span>
          <select className={control} value={form.roomPref} onChange={(e) => setForm((f) => ({ ...f, roomPref: e.target.value }))}>
            <option value="">Any</option>
            {ROOM_TYPES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Furnished</span>
          <select className={control} value={form.furnishedPref} onChange={(e) => setForm((f) => ({ ...f, furnishedPref: e.target.value }))}>
            <option value="">Any</option>
            {FURNISHED.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="md:col-span-2"><span className="mb-1 block text-sm text-muted">About me</span><textarea className="w-full rounded-xl border border-line bg-paper p-3" rows={4} value={form.about} onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))} /></label>
        <label className="md:col-span-2"><span className="mb-1 block text-sm text-muted">Lifestyle</span><input className={control} value={form.lifestyle} onChange={(e) => setForm((f) => ({ ...f, lifestyle: e.target.value }))} /></label>
        <div className="flex flex-col gap-2 text-sm md:col-span-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.showAge} onChange={(e) => setForm((f) => ({ ...f, showAge: e.target.checked }))} /> Show age</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.showOccupation} onChange={(e) => setForm((f) => ({ ...f, showOccupation: e.target.checked }))} /> Show occupation</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.showCity} onChange={(e) => setForm((f) => ({ ...f, showCity: e.target.checked }))} /> Show city</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.allowMessages === "EVERYONE"} onChange={(e) => setForm((f) => ({ ...f, allowMessages: e.target.checked ? "EVERYONE" : "NONE" }))} /> Allow messages</label>
        </div>
        </fieldset>
        {error ? <p className="text-sm text-danger md:col-span-2">{error}</p> : null}
        <p
          role="status"
          aria-live="polite"
          className={`text-sm font-medium md:col-span-2 ${status.kind === "error" ? "rounded-2xl bg-danger/10 px-4 py-3 text-danger" : status.kind === "saved" ? "fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-2xl bg-brand px-4 py-3 text-center text-card shadow-lg md:inset-x-0" : "sr-only"}`}
        >
          {saveStatusText(status)}
        </p>
        <button
          className="h-12 rounded-full bg-brand font-semibold text-card transition disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
          type="submit"
          disabled={!canSave(load) || isSaving(status)}
          aria-busy={isSaving(status) || load.kind === "loading"}
        >
          {saveButtonLabelFor(load, saveButtonLabel(status))}
        </button>
      </form>
      <ChangePassword />
      <button type="button" className="mt-6 text-sm text-muted underline" onClick={() => void signOut("/").catch(() => setError("Could not sign out. Try again."))}>
        Sign out
      </button>
    </Shell>
  );
}
