import { useEffect, useState } from "react";
import { getMyCredits } from "@/lib/roomsetu/fee-credits-api";
import { creditBalanceLine } from "@/lib/roomsetu/fee-credits";

type Data = Awaited<ReturnType<typeof getMyCredits>>;

/** "₹499 Roomeo credit" card. Renders nothing unless the user holds credit or has had one. */
export function CreditBalance() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    void getMyCredits().then(setData).catch(() => setData(null));
  }, []);
  if (!data || data.items.length === 0) return null;
  return (
    <section className="mt-6 rounded-3xl border border-line bg-card p-4" data-testid="credit-balance">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Roomeo credit</p>
      <p className="mt-1 font-display text-3xl" data-testid="credit-balance-inr">₹{data.balanceInr}</p>
      <p className="mt-1 text-sm text-muted">{creditBalanceLine(data.balanceInr)}</p>
      {!data.enabled && data.balanceInr > 0 ? <p className="mt-1 text-xs text-muted">Credits are paused right now; your balance is kept.</p> : null}
      <ul className="mt-3 space-y-1 text-sm">
        {data.items.map((c) => (
          <li key={c.id} className="flex flex-wrap justify-between gap-x-3" data-testid="credit-row">
            <span>{c.reason}</span>
            <span className="text-muted">
              ₹{c.amountInr} · {c.status === "void" ? "void" : c.status === "applied" ? "used" : c.usedInr > 0 ? `₹${c.remainingInr} left` : "available"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
