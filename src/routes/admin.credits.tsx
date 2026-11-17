import { adminBeforeLoad } from "@/lib/roomsetu/admin-gate-api";
import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { errText } from "@/lib/ui-text";
import { readableDate } from "@/lib/roomsetu/dates";
import { adminCredits, adminIssuePairCredits, adminVoidCredit } from "@/lib/roomsetu/fee-credits-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/credits")({
  beforeLoad: adminBeforeLoad,
  head: () => pageHead("Referral credits · Operator", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin/credits">
      <Credits />
    </NeedAccount>
  ),
});

type Data = Awaited<ReturnType<typeof adminCredits>>;
const input = "h-11 w-full min-w-0 rounded-full border border-line bg-transparent px-4 text-sm";
const btn = "h-11 rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-40";

function Credits() {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");
  const [pair, setPair] = useState({ referrer: "", friend: "", note: "" });
  const [why, setWhy] = useState<Record<string, string>>({});
  const load = () => void adminCredits().then(setData).catch((e) => setError(errText(e)));
  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  function run(key: string, p: Promise<unknown>, done: string) {
    setError("");
    setOk("");
    setBusy(key);
    void p
      .then(() => {
        setOk(done);
        load();
      })
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(""));
  }
  const st = data?.status;
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">Referral credits</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Issue by hand only after the friend has moved in and paid their first month. Each pair gets two credits (referrer + friend). A credit comes off that person's next Roomeo fee (tenant or owner) automatically. Never cash, never paid out.
      </p>
      {st ? (
        <p className="mt-3 rounded-2xl border border-line bg-card p-3 text-sm" data-testid="credits-state">
          Programme {st.enabled ? "ON" : "OFF"} (ROOMEO_REFERRAL_CREDITS_ENABLED) · ₹{st.amountInr} per credit · pairs {st.pairsUsed} of {st.pairsCap} (ROOMEO_REFERRAL_CREDIT_PAIRS_CAP) · unused balance ₹{st.outstandingInr}
          {st.ready ? "" : " · migration 0032 isn't applied on this database yet"}
        </p>
      ) : null}
      {data ? <p className="mt-2 text-xs text-muted">{data.gstNote}</p> : null}
      {error ? <p className="mt-3 text-danger" role="alert">{error}</p> : null}
      {ok ? <p className="mt-3 font-semibold text-brand" role="status">{ok}</p> : null}

      <h2 className="mt-8 text-2xl font-semibold">Issue a pair</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input className={input} aria-label="Referrer email or user id" placeholder="Referrer email or user id" value={pair.referrer} onChange={(e) => setPair({ ...pair, referrer: e.target.value })} data-testid="credit-referrer" />
        <input className={input} aria-label="Friend email or user id" placeholder="Friend (moved in) email or user id" value={pair.friend} onChange={(e) => setPair({ ...pair, friend: e.target.value })} data-testid="credit-friend" />
        <input className={input} aria-label="Note" placeholder="Note (e.g. moved in 12 Nov, rent paid)" value={pair.note} onChange={(e) => setPair({ ...pair, note: e.target.value })} />
      </div>
      <button type="button" className={`${btn} mt-2 bg-brand text-card`} disabled={!pair.referrer || !pair.friend || busy === "issue" || !st?.enabled} data-testid="credit-issue"
        onClick={() => run("issue", adminIssuePairCredits({ data: pair }), "Issued 2 credits.")}>
        Issue ₹{st?.amountInr ?? 499} + ₹{st?.amountInr ?? 499}
      </button>

      <h2 className="mt-8 text-2xl font-semibold">Credits</h2>
      <ul className="mt-3 space-y-3">
        {(data?.items ?? []).map((c) => (
          <li key={c.id} className="rounded-2xl border border-line bg-card p-4 text-sm" data-testid="admin-credit-row">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{c.userName}</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold">{c.status}</span>
              <span>₹{c.amountInr} · used ₹{c.usedInr} · left ₹{c.remainingInr}</span>
            </div>
            <p className="mt-1 text-muted">
              Pair: {c.referrerName} → {c.friendName} · issued {readableDate(c.createdAt.slice(0, 10))} by {c.issuedBy}
              {c.note ? ` · ${c.note}` : ""}
              {c.voidedAt ? ` · void ${readableDate(c.voidedAt.slice(0, 10))}: ${c.voidReason}` : ""}
            </p>
            {c.status === "issued" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <input className={`${input} max-w-xs`} aria-label="Void reason" placeholder="Why void?" value={why[c.id] ?? ""} onChange={(e) => setWhy({ ...why, [c.id]: e.target.value })} />
                <button type="button" className={btn} disabled={!why[c.id] || busy === c.id} onClick={() => run(c.id, adminVoidCredit({ data: { id: c.id, reason: why[c.id] ?? "" } }), "Credit voided.")}>
                  Void
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {data && data.items.length === 0 ? <p className="mt-3 text-muted">No credits yet.</p> : null}

      <h2 className="mt-8 text-2xl font-semibold">Audit trail</h2>
      <ul className="mt-3 space-y-1 text-xs" data-testid="credit-events">
        {(data?.events ?? []).map((e) => (
          <li key={e.id} className="border-b border-line py-1">
            {e.created_at.slice(0, 16)} · {e.entity} {e.action}{e.amount_inr != null ? ` ₹${e.amount_inr}` : ""} · by {e.actor_id} {e.note ? `· ${e.note}` : ""}
          </li>
        ))}
      </ul>
    </AdminFrame>
  );
}
