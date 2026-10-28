import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, UsersThree } from "@phosphor-icons/react";
import { Shell } from "@/components/shell";
import { NeedAccount } from "@/components/need-account";
import { errText } from "@/lib/ui-text";
import {
  createSquad,
  mySquads,
  ownerDecideSquad,
  ownerSquadRequests,
} from "@/lib/roomsetu/squad-api";
import {
  btnPrimary,
  btnSmall,
  btnSmallPrimary,
  card,
  errorBox,
  inner,
  input,
  linkCls,
  skeleton,
} from "@/components/ui-tokens";

export const Route = createFileRoute("/squads/")({
  head: () => pageHead("Squads, rent a whole flat with friends", { noindex: true }),
  component: () => (
    <NeedAccount next="/squads">
      <Squads />
    </NeedAccount>
  ),
});

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const DECISION_LABEL = {
  ACCEPTED: "Accept",
  VISIT_PROPOSED: "Propose visit",
  DECLINED: "Decline",
} as const;

function Squads() {
  const navigate = useNavigate();
  const [squads, setSquads] = useState<Awaited<ReturnType<typeof mySquads>> | null>(null);
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof ownerSquadRequests>>>([]);
  const [form, setForm] = useState({
    name: "",
    area: "",
    budgetPerPerson: "12500",
    moveIn: "",
    size: "3",
  });
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [reqError, setReqError] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  function load() {
    void mySquads()
      .then(setSquads)
      .catch((e) => setError(errText(e)));
    void ownerSquadRequests()
      .then(setRequests)
      .catch(() => undefined);
  }
  useEffect(load, []);
  const field = (label: string, el: React.ReactNode) => (
    <label className="block">
      <span className="mb-2 block text-sm text-muted">{label}</span>
      {el}
    </label>
  );
  return (
    <Shell>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight [text-wrap:balance]">Squads</h1>
      <p className="mt-2 max-w-[680px] text-base text-muted [text-wrap:pretty]">
        Rent a whole flat with 2 to 4 friends. Make a squad, share the invite on WhatsApp, shortlist
        flats, vote, and send the owner one joint request.
      </p>
      {error ? (
        <p className={`mt-4 ${errorBox}`} role="alert">
          {error}
        </p>
      ) : null}

      {requests.length ? (
        <section className="mt-8" data-testid="owner-requests" aria-labelledby="owner-h">
          <h2 id="owner-h" className="text-2xl font-semibold">
            Squad requests for your flats
          </h2>
          <ul className="mt-4 space-y-4">
            {requests.map((r) => (
              <li key={r.id} className={card} data-testid="owner-request">
                <p className="text-base font-semibold">
                  {r.squadName} for {r.title}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {r.members.length} people · combined budget {inr(r.combinedBudget)} a month (rent{" "}
                  {inr(r.rent)}){r.moveIn ? ` · move in ${r.moveIn}` : ""} · status{" "}
                  <b>{r.status}</b>
                </p>
                <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  {r.members.map((m, i) => (
                    <li key={i} className={inner}>
                      <span className="font-semibold">{m.name}</span>
                      {m.age ? `, ${m.age}` : ""}
                      {m.occupation ? ` · ${m.occupation}` : ""} ·{" "}
                      {m.phoneVerified ? "phone ✓" : "phone ✗"} ·{" "}
                      {m.idVerified ? "ID ✓" : "ID not verified"}
                    </li>
                  ))}
                </ul>
                {r.note ? <p className="mt-2 text-sm">Your note: {r.note}</p> : null}
                {r.status === "PAUSED" ? (
                  <p className={`mt-4 text-sm text-muted ${inner}`}>
                    Paused because someone left the squad. You can decide once they resend.
                  </p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <input
                      className={`${input} h-10 min-w-0 flex-1 text-sm`}
                      placeholder="Visit time or note, optional"
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                      aria-label="Note to squad"
                    />
                    {(["ACCEPTED", "VISIT_PROPOSED", "DECLINED"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        disabled={busy === r.id}
                        className={d === "ACCEPTED" ? btnSmallPrimary : btnSmall}
                        onClick={() => {
                          setReqError({ ...reqError, [r.id]: "" });
                          setBusy(r.id);
                          void ownerDecideSquad({
                            data: { id: r.id, decision: d, note: notes[r.id] ?? "" },
                          })
                            .then(load)
                            .catch((e) => setReqError({ ...reqError, [r.id]: errText(e) }))
                            .finally(() => setBusy(""));
                        }}
                      >
                        {DECISION_LABEL[d]}
                      </button>
                    ))}
                  </div>
                )}
                {reqError[r.id] ? (
                  <p className={`mt-2 ${errorBox}`} role="alert">
                    {reqError[r.id]}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  If you decline before accepting, the squad's contact fee is refunded by roomeo.
                  You never pay.
                </p>
                {r.threadId ? (
                  <Link
                    to="/messages"
                    search={{ thread: r.threadId }}
                    className={`mt-2 inline-flex items-center gap-1 text-sm ${linkCls}`}
                  >
                    Open squad chat <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    Squad chat opens once the squad pays the contact fee.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="mine-h">
        <h2 id="mine-h" className="text-2xl font-semibold">
          Your squads
        </h2>
        {squads === null ? (
          <div
            className="mt-4 grid gap-4 sm:grid-cols-2"
            aria-busy="true"
            aria-label="Loading squads"
          >
            <div className={`${skeleton} h-20`} />
            <div className={`${skeleton} h-20`} />
          </div>
        ) : squads.length === 0 ? (
          <div className={`mt-4 ${card} flex items-center gap-4`}>
            <UsersThree size={32} aria-hidden="true" className="shrink-0 text-brand" />
            <p className="text-sm text-muted">
              No squad yet. Start one below, or open an invite link a friend sent you.
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {squads.map((s) => (
              <li key={s.id}>
                <Link
                  to="/squads/$id"
                  params={{ id: s.id }}
                  data-testid="squad-card"
                  className={`block ${card} transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
                >
                  <p className="text-base font-semibold">{s.name}</p>
                  <p className="text-sm text-muted">
                    {s.area} · {s.members}/{s.size} people · {inr(s.budget)} per person ·{" "}
                    {s.status.toLowerCase()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 max-w-xl" aria-labelledby="new-h">
        <h2 id="new-h" className="text-2xl font-semibold">
          Start a squad
        </h2>
        <form
          className="mt-4 grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim() || !form.area.trim())
              return setFormError("Add a squad name and the area you want to live in.");
            setFormError("");
            setBusy("create");
            void createSquad({
              data: {
                ...form,
                budgetPerPerson: Number(form.budgetPerPerson),
                size: Number(form.size),
              },
            })
              .then((r) => navigate({ to: "/squads/$id", params: { id: r.id } }))
              .catch((err) => setFormError(errText(err)))
              .finally(() => setBusy(""));
          }}
        >
          {field(
            "Squad name",
            <input
              className={input}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="HSR flat hunters"
            />,
          )}
          {field(
            "Area",
            <input
              className={input}
              required
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="HSR Layout"
            />,
          )}
          {field(
            "Budget per person (₹ a month)",
            <input
              className={input}
              inputMode="numeric"
              value={form.budgetPerPerson}
              onChange={(e) =>
                setForm({ ...form, budgetPerPerson: e.target.value.replace(/\D/g, "") })
              }
            />,
          )}
          {field(
            "Move in date",
            <input
              className={input}
              type="date"
              value={form.moveIn}
              onChange={(e) => setForm({ ...form, moveIn: e.target.value })}
            />,
          )}
          {field(
            "Squad size",
            <select
              className={input}
              value={form.size}
              onChange={(e) => setForm({ ...form, size: e.target.value })}
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={String(n)}>
                  {n} people
                </option>
              ))}
            </select>,
          )}
          {formError ? (
            <p className={errorBox} role="alert">
              {formError}
            </p>
          ) : null}
          <button type="submit" disabled={busy === "create"} className={btnPrimary}>
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
