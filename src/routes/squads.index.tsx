import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { NeedAccount } from "@/components/need-account";
import { control } from "@/components/cards";
import { errText } from "@/lib/ui-text";
import {
  createSquad,
  mySquads,
  ownerDecideSquad,
  ownerSquadRequests,
} from "@/lib/roomsetu/squad-api";

export const Route = createFileRoute("/squads/")({
  head: () => pageHead("Squads · rent a whole flat with friends", { noindex: true }),
  component: () => (
    <NeedAccount next="/squads">
      <Squads />
    </NeedAccount>
  ),
});

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function Squads() {
  const navigate = useNavigate();
  const [squads, setSquads] = useState<Awaited<ReturnType<typeof mySquads>>>([]);
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof ownerSquadRequests>>>([]);
  const [form, setForm] = useState({
    name: "",
    area: "",
    budgetPerPerson: "12000",
    moveIn: "",
    size: "3",
  });
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  function load() {
    void mySquads()
      .then(setSquads)
      .catch((e) => setError(errText(e)));
    void ownerSquadRequests()
      .then(setRequests)
      .catch(() => undefined);
  }
  useEffect(load, []);
  return (
    <Shell>
      <h1 className="text-4xl font-semibold tracking-tight">Squads</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Rent a whole flat with 2–4 friends. Make a squad, share the invite on WhatsApp, shortlist
        flats, vote, and send the owner one joint request.
      </p>
      {error ? (
        <p className="mt-3 text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {requests.length ? (
        <section className="mt-8" data-testid="owner-requests">
          <h2 className="text-2xl font-semibold">Squad requests for your flats</h2>
          <ul className="mt-3 space-y-3">
            {requests.map((r) => (
              <li
                key={r.id}
                className="rounded-3xl border border-line bg-card p-4"
                data-testid="owner-request"
              >
                <p className="font-semibold">
                  {r.squadName} → {r.title}
                </p>
                <p className="text-sm text-muted">
                  {r.members.length} people · combined budget {inr(r.combinedBudget)}/mo (rent{" "}
                  {inr(r.rent)}) {r.moveIn ? `· move-in ${r.moveIn}` : ""} · status{" "}
                  <b>{r.status}</b>
                </p>
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {r.members.map((m, i) => (
                    <li key={i} className="rounded-2xl bg-paper px-3 py-2">
                      {m.name}
                      {m.age ? `, ${m.age}` : ""}
                      {m.occupation ? ` · ${m.occupation}` : ""} ·{" "}
                      {m.phoneVerified ? "phone ✓" : "phone ✗"} ·{" "}
                      {m.idVerified ? "ID ✓" : "ID not verified"}
                    </li>
                  ))}
                </ul>
                {r.note ? <p className="mt-2 text-sm">Your note: {r.note}</p> : null}
                {r.status === "PAUSED" ? (
                  <p className="mt-2 text-sm text-muted">Paused: someone left the squad.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      className="h-10 min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 text-sm"
                      placeholder="Visit time or note (optional)"
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                      aria-label="Note to squad"
                    />
                    {(["ACCEPTED", "VISIT_PROPOSED", "DECLINED"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`h-10 rounded-full px-4 text-sm font-semibold ${d === "ACCEPTED" ? "bg-brand text-card" : "border border-line"}`}
                        onClick={() =>
                          void ownerDecideSquad({
                            data: { id: r.id, decision: d, note: notes[r.id] ?? "" },
                          })
                            .then(load)
                            .catch((e) => setError(errText(e)))
                        }
                      >
                        {d === "ACCEPTED"
                          ? "Accept"
                          : d === "DECLINED"
                            ? "Decline"
                            : "Propose visit"}
                      </button>
                    ))}
                  </div>
                )}
                {r.threadId ? (
                  <Link
                    to="/messages"
                    search={{ thread: r.threadId }}
                    className="mt-2 inline-block text-sm font-semibold text-brand"
                  >
                    Open squad chat →
                  </Link>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    Squad chat opens once the squad pays the contact fee. You never pay.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-2xl font-semibold">Your squads</h2>
        {squads.length === 0 ? (
          <p className="mt-2 text-muted">
            No squad yet. Start one below or open an invite link from a friend.
          </p>
        ) : null}
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {squads.map((s) => (
            <li key={s.id}>
              <Link
                to="/squads/$id"
                params={{ id: s.id }}
                className="block rounded-3xl border border-line bg-card p-4"
                data-testid="squad-card"
              >
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-muted">
                  {s.area} · {s.members}/{s.size} people · {inr(s.budget)}/person · {s.status}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 max-w-xl">
        <h2 className="text-2xl font-semibold">Start a squad</h2>
        <form
          className="mt-3 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            void createSquad({
              data: {
                ...form,
                budgetPerPerson: Number(form.budgetPerPerson),
                size: Number(form.size),
              },
            })
              .then((r) => navigate({ to: "/squads/$id", params: { id: r.id } }))
              .catch((err) => setError(errText(err)));
          }}
        >
          <label>
            <span className="mb-1 block text-sm text-muted">Squad name</span>
            <input
              className={control}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="HSR flat hunters"
            />
          </label>
          <label>
            <span className="mb-1 block text-sm text-muted">Area</span>
            <input
              className={control}
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="HSR Layout"
            />
          </label>
          <label>
            <span className="mb-1 block text-sm text-muted">Budget per person (₹/month)</span>
            <input
              className={control}
              inputMode="numeric"
              value={form.budgetPerPerson}
              onChange={(e) =>
                setForm({ ...form, budgetPerPerson: e.target.value.replace(/\D/g, "") })
              }
            />
          </label>
          <label>
            <span className="mb-1 block text-sm text-muted">Move-in</span>
            <input
              className={control}
              type="date"
              value={form.moveIn}
              onChange={(e) => setForm({ ...form, moveIn: e.target.value })}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm text-muted">Squad size</span>
            <select
              className={control}
              value={form.size}
              onChange={(e) => setForm({ ...form, size: e.target.value })}
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={String(n)}>
                  {n} people
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-12 rounded-full bg-brand font-semibold text-card">
            Create squad
          </button>
          <p className="text-xs text-muted">
            You need a verified phone number. Everyone who joins needs one too.
          </p>
        </form>
      </section>
    </Shell>
  );
}
