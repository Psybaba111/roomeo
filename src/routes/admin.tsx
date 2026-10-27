import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { GrowthChart } from "@/components/growth-chart";
import { errText } from "@/components/shell";
import { adminAddCity, adminOverview } from "@/lib/roomsetu/admin-api";
import { readLayout, saveLayout } from "@/lib/roomsetu/account-api";
import { ADMIN_WIDGETS, defaultLayout } from "@/lib/roomsetu/constants";
import { inr } from "@/lib/roomsetu/map";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin")({
  component: () => (
    <NeedAccount next="/admin">
      <Pulse />
    </NeedAccount>
  ),
});

type Overview = Awaited<ReturnType<typeof adminOverview>>;
type Widget = { id: string; position: number; visible: boolean };

function Pulse() {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [widgets, setWidgets] = useState<Widget[]>(defaultLayout(ADMIN_WIDGETS));
  const [drag, setDrag] = useState<string | null>(null);
  const [city, setCity] = useState({ name: "", state: "", lat: "", lng: "", locality: "" });
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!user) return;
    void adminOverview()
      .then(setData)
      .catch((e) => setError(errText(e)));
    void readLayout({ data: { surface: "admin" } })
      .then((saved) => {
        if (saved.widgets.length) setWidgets(saved.widgets);
      })
      .catch(() => undefined);
  }, [user]);

  function move(id: string, dir: -1 | 1) {
    setWidgets((cur) => {
      const next = [...cur];
      const i = next.findIndex((w) => w.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= next.length) return cur;
      const [item] = next.splice(i, 1);
      next.splice(j, 0, item);
      return next.map((w, idx) => ({ ...w, position: idx + 1 }));
    });
  }

  const visible = widgets.filter((w) => w.visible);
  const blocks: Record<string, ReactNode> = data
    ? {
        kpis: (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["People", data.users],
              ["New this week", data.newUsers],
              ["Active rooms", data.activeListings],
              ["Room wanted", data.roomWanted],
              ["Verified hosts", data.verifiedHosts],
              ["Pending checks", data.pendingVerification],
              ["Requests", data.applications],
              ["Open reports", data.openReports],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-line bg-card p-4">
                <p className="text-sm text-muted">{label}</p>
                <p className="font-display text-3xl tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        ),
        flywheel: (
          <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Hosts", data.users],
              ["Rooms", data.activeListings],
              ["Searches", data.searches],
              ["Seekers", data.roomWanted],
              ["Enquiries", data.conversations],
              ["Accepted", data.accepted],
            ].map(([label, value]) => (
              <li key={String(label)} className="rounded-2xl bg-brand-deep p-3 text-card">
                <p className="text-xs text-brand-soft">{label}</p>
                <p className="font-display text-2xl tabular-nums">{value}</p>
              </li>
            ))}
          </ol>
        ),
        growth: <GrowthChart data={data.series} />,
        cities: (
          <ul>
            {data.cities.map((c) => (
              <li key={c.city} className="flex justify-between border-b border-line py-2 text-sm">
                <span>{c.city}</span>
                <span className="tabular-nums text-muted">{c.rooms}</span>
              </li>
            ))}
          </ul>
        ),
        trust: (
          <ul className="space-y-1 text-sm">
            <li>Verified people {data.verifiedHosts}</li>
            <li>Fraud flags {data.fraudFlags}</li>
            <li>Possible duplicates {data.duplicates}</li>
            <li>Suspensions {data.suspensions}</li>
            <li>Response rate {data.responseRate}%</li>
          </ul>
        ),
        revenue: (
          <div>
            <p className="font-display text-3xl tabular-nums">{inr(data.revenue)}</p>
            <p className="text-sm text-muted">Captured payments. Indicated rent on accepted requests is {inr(data.indicatedGmv)}. Conversion {data.conversion}%. Average rent {inr(data.avgRent)}.</p>
          </div>
        ),
      }
    : {};

  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">Marketplace pulse</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Counts include sample rooms so the city network is visible. Sample rows are marked elsewhere. Real accounts: {data?.realUsers ?? "…"}. Drag a section or use the arrows, then save this desk for yourself.
      </p>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      {!data && !error ? <p className="mt-4 text-muted">Loading the desk…</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {widgets.map((w) => (
          <span key={w.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2 py-1 text-xs">
            <button type="button" onClick={() => move(w.id, -1)} aria-label="Move up">↑</button>
            <button type="button" onClick={() => move(w.id, 1)} aria-label="Move down">↓</button>
            <button type="button" onClick={() => setWidgets((cur) => cur.map((item) => (item.id === w.id ? { ...item, visible: !item.visible } : item)))}>
              {w.visible ? "Hide" : "Show"} {ADMIN_WIDGETS.find((a) => a.id === w.id)?.title ?? w.id}
            </button>
          </span>
        ))}
        <button
          type="button"
          className="h-8 rounded-full bg-brand px-3 text-xs font-semibold text-card"
          onClick={() => {
            void saveLayout({ data: { surface: "admin", widgets } })
              .then(() => setNote("Desk saved."))
              .catch((e) => setNote(errText(e)));
          }}
        >
          Save layout
        </button>
      </div>
      {note ? <p className="mt-2 text-sm">{note}</p> : null}
      <div className="mt-6 space-y-4">
        {visible.map((w) => (
          <section
            key={w.id}
            draggable
            onDragStart={() => setDrag(w.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (!drag || drag === w.id) return;
              setWidgets((cur) => {
                const next = [...cur];
                const from = next.findIndex((item) => item.id === drag);
                const to = next.findIndex((item) => item.id === w.id);
                const [item] = next.splice(from, 1);
                next.splice(to, 0, item);
                return next.map((entry, idx) => ({ ...entry, position: idx + 1 }));
              });
              setDrag(null);
            }}
            className="rounded-3xl border border-line bg-paper p-4"
          >
            <h2 className="mb-3 font-display text-2xl">{ADMIN_WIDGETS.find((a) => a.id === w.id)?.title}</h2>
            {blocks[w.id]}
          </section>
        ))}
      </div>
      <form
        className="mt-8 grid gap-3 rounded-3xl border border-line bg-card p-4 md:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          void adminAddCity({
            data: { name: city.name, state: city.state, lat: Number(city.lat), lng: Number(city.lng), locality: city.locality },
          })
            .then(() => setNote(`Added ${city.name}.`))
            .catch((err) => setNote(errText(err)));
        }}
      >
        <input className="h-12 rounded-xl border border-line bg-paper px-3" placeholder="New city" value={city.name} onChange={(e) => setCity({ ...city, name: e.target.value })} />
        <input className="h-12 rounded-xl border border-line bg-paper px-3" placeholder="State" value={city.state} onChange={(e) => setCity({ ...city, state: e.target.value })} />
        <input className="h-12 rounded-xl border border-line bg-paper px-3" placeholder="Latitude" value={city.lat} onChange={(e) => setCity({ ...city, lat: e.target.value })} />
        <input className="h-12 rounded-xl border border-line bg-paper px-3" placeholder="Longitude" value={city.lng} onChange={(e) => setCity({ ...city, lng: e.target.value })} />
        <button className="h-12 rounded-full bg-ink font-semibold text-card" type="submit">Add city</button>
        <input className="h-12 rounded-xl border border-line bg-paper px-3 md:col-span-5" placeholder="First locality (optional)" value={city.locality} onChange={(e) => setCity({ ...city, locality: e.target.value })} />
      </form>
    </AdminFrame>
  );
}
