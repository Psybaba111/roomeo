import { adminBeforeLoad } from "@/lib/roomsetu/admin-gate-api";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import { adminFunnel } from "@/lib/roomsetu/funnel-api";
import { stepRate } from "@/lib/roomsetu/funnel-steps";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/funnel")({
  beforeLoad: adminBeforeLoad,
  head: () => pageHead("Funnel · Operator", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin/funnel">
      <Funnel />
    </NeedAccount>
  ),
});

type Data = Awaited<ReturnType<typeof adminFunnel>>;
const seg = "h-10 rounded-full px-4 text-sm font-semibold transition duration-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

function Funnel() {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState<7 | 30>(7);
  useEffect(() => {
    if (!user) return;
    void adminFunnel().then(setData).catch((e) => setError(errText(e)));
  }, [user]);
  const w = data?.windows.find((x) => x.days === days);
  const nudges = data ? (days === 7 ? data.nudges.week : data.nudges.month) : null;
  let prev: number | null = null;
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl [text-wrap:balance]">Funnel</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted [text-wrap:pretty]">
        Search to move in. Counts come from the database (GA4 can&apos;t be read from here), so listing views and WhatsApp taps are in GA4 only.
      </p>
      <div className="mt-4 inline-flex gap-1 rounded-full border border-line bg-card p-1" role="group" aria-label="Time window">
        {([7, 30] as const).map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`${seg} ${days === d ? "bg-ink text-card" : ""}`} data-testid={`funnel-${d}`}>
            Last {d} days
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
      {!data && !error ? (
        <div className="mt-6 space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl border border-line bg-card motion-reduce:animate-none" />)}
        </div>
      ) : null}
      {w ? (
        <ol className="mt-6 space-y-2" data-testid="funnel-steps">
          {w.steps.map((s, i) => {
            const rate = s.count == null ? "" : stepRate(prev, s.count);
            if (s.count != null) prev = s.count;
            return (
              <li key={s.key} className="rounded-2xl border border-line bg-card p-4" data-testid={`funnel-step-${s.key}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">
                    <span className="mr-2 text-sm tabular-nums text-muted">{i + 1}</span>
                    {s.label}
                  </p>
                  <p className="shrink-0 text-right">
                    <span className="font-display text-2xl tabular-nums" data-testid={`funnel-count-${s.key}`}>{s.count == null ? "GA4" : s.count}</span>
                    {rate ? <span className="ml-2 text-xs text-muted">{rate} of the step before</span> : null}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted [text-wrap:pretty]">
                  {s.source}
                  {s.logged != null ? ` · ${s.logged} in the event log` : ""}
                </p>
              </li>
            );
          })}
        </ol>
      ) : null}
      {data ? (
        <section className="mt-6 rounded-2xl border border-line bg-card p-4" aria-labelledby="nudges" data-testid="funnel-nudges">
          <h2 id="nudges" className="text-lg font-semibold">Owner reminders</h2>
          <p className="mt-1 text-sm text-muted [text-wrap:pretty]">
            A request still waiting after 2 hours gets one WhatsApp reminder to the owner, at most once.{" "}
            {data.whatsappOn && data.nudgeTemplateSet ? "Sending is on." : "Sending is off, so due reminders are only logged as held."}
          </p>
          {nudges ? (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[["Held", nudges.HELD], ["Sent", nudges.SENT], ["Failed", (nudges.FAILED ?? 0) + (nudges.SKIPPED ?? 0)]].map(([k, v]) => (
                <div key={String(k)} className="rounded-xl border border-line p-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-display text-xl tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted" data-testid="funnel-no-log">The reminder and event logs need migration 0034, which this database doesn&apos;t have yet. The counts above still work.</p>
          )}
        </section>
      ) : null}
    </AdminFrame>
  );
}
