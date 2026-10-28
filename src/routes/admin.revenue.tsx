import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import { adminRevenue, adminRunSweep } from "@/lib/roomsetu/pricing-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { btnSmall, btnSmallPrimary, card, errorBox, inner, skeleton } from "@/components/ui-tokens";

export const Route = createFileRoute("/admin/revenue")({
  head: () => pageHead("Revenue · Operator", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin/revenue">
      <Revenue />
    </NeedAccount>
  ),
});

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function Revenue() {
  const { user } = useCurrentUserState();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Awaited<ReturnType<typeof adminRevenue>> | null>(null);
  const [error, setError] = useState("");
  const [sweep, setSweep] = useState("");
  const [busy, setBusy] = useState(false);
  function load(d = days) {
    setError("");
    void adminRevenue({ data: { days: d } })
      .then(setData)
      .catch((e) => setError(errText(e)));
  }
  useEffect(() => {
    if (user) load();
  }, [user, days]);
  const stats: [string, string][] = data
    ? [
        ["New signups", String(data.signups)],
        ["Owner contacts started", String(data.contactStarts)],
        ["Free contacts used", String(data.freeContacts)],
        ["Passes sold", String(data.passesSold)],
        ["Active passes", String(data.activePasses)],
        ["Boosts", String(data.boosts)],
        ["Fast tracks", String(data.fastTracks)],
        ["Confirmed move ins", String(data.moveIns)],
        ["Declined contacts", String(data.declined)],
        ["No reply contacts", String(data.noReply)],
        ["Refunds as share of revenue", `${data.refundPct}%`],
        ["Net revenue", inr(data.netInr)],
      ]
    : [];
  return (
    <AdminFrame>
      <h1 className="text-4xl font-semibold tracking-tight">Revenue</h1>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Period">
        {[7, 30, 90, 365].map((d) => (
          <button key={d} type="button" aria-pressed={d === days} className={d === days ? btnSmallPrimary : btnSmall} onClick={() => setDays(d)}>
            {d} days
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          className={btnSmall}
          data-testid="run-sweep"
          onClick={() => {
            setBusy(true);
            void adminRunSweep()
              .then((r) => {
                setSweep(`Sweep done: ${r.replied} replied, ${r.noReply} no reply, ${r.passesSettled} passes settled, ${r.refunds} refunds due.`);
                load();
              })
              .catch((e) => setError(errText(e)))
              .finally(() => setBusy(false));
          }}
        >
          Run refund sweep now
        </button>
      </div>
      {sweep ? <p className={`mt-4 text-sm ${inner}`} data-testid="sweep-result">{sweep}</p> : null}
      {error ? <p className={`mt-4 ${errorBox}`} role="alert">{error}</p> : null}
      {!data && !error ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className={`h-24 ${skeleton}`} />)}
        </div>
      ) : null}
      {data ? (
        <>
          <p className="mt-4 text-sm text-muted">
            Model {data.config.model === "FREE_THEN_PASS" ? `free contacts (${data.config.freeContacts}) then passes` : "₹ per listing (rollback)"} · passes{" "}
            {data.config.passesEnabled ? "on" : "off"} · move in fee {data.config.successFeeEnabled ? "on" : "off"}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="revenue-stats">
            {stats.map(([k, v]) => (
              <div key={k} className={card}>
                <p className="text-sm text-muted">{k}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <section className={`mt-8 ${card}`} aria-labelledby="bytype-h">
            <h2 id="bytype-h" className="text-2xl font-semibold">Revenue by type</h2>
            {data.byType.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No confirmed payments in this period yet. Approved UPI payments show here.</p>
            ) : (
              <table className="mt-4 w-full text-left text-sm" data-testid="revenue-table">
                <thead>
                  <tr className="text-muted">
                    <th className="py-2 font-semibold">Type</th>
                    <th className="py-2 font-semibold">Count</th>
                    <th className="py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byType.map((r) => (
                    <tr key={r.label} className="border-t border-line">
                      <td className="py-2">{r.label}</td>
                      <td className="py-2 tabular-nums">{r.count}</td>
                      <td className="py-2 text-right tabular-nums">{inr(r.inr)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line font-semibold">
                    <td className="py-2">Gross</td>
                    <td />
                    <td className="py-2 text-right tabular-nums">{inr(data.grossInr)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-2">Refunds</td>
                    <td />
                    <td className="py-2 text-right tabular-nums">−{inr(data.refundInr)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </AdminFrame>
  );
}
