import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { readableDate } from "@/lib/roomsetu/dates";
import { commissionLine } from "@/lib/roomsetu/owner-fee";
import { getMyCommissions } from "@/lib/roomsetu/owner-fee-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/owner-fees")({
  head: () => pageHead("Roomeo commissions", { noindex: true }),
  component: () => (
    <NeedAccount next="/owner-fees">
      <OwnerFees />
    </NeedAccount>
  ),
});

const LABEL: Record<string, string> = { due: "Due", due_50: "Tenant left early · 50% due", paid: "Paid", refunded_50: "50% refunded", waived: "₹0 · founding partner" };

function OwnerFees() {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof getMyCommissions>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (user) void getMyCommissions().then(setData).catch((e) => setError(errText(e)));
  }, [user]);
  const v = data?.view;
  const due = (data?.items ?? []).filter((c) => c.status === "due" || c.status === "due_50");
  return (
    <Shell>
      <h1 className="font-display text-4xl">Roomeo commissions</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        {v?.on
          ? `Listing is free. You pay Roomeo a flat ₹${v.flatInr}${v.gstPct ? ` (GST included)` : ""} (₹0 for founding partners) only for a tenant who moves in within ${v.attributionDays} days of their first Roomeo enquiry (each bed counts, squads too). It's due within ${v.dueDays} days of the move-in. If the tenant leaves within ${v.refundDays} days, you pay only ${v.refundPct}%. Please don't charge Roomeo tenants any brokerage.`
          : "Roomeo doesn't charge owners a commission right now."}
      </p>
      {error ? <p className="mt-3 text-danger" role="alert">{error}</p> : null}
      {due.length ? (
        <p className="mt-4 rounded-2xl border border-line bg-card p-3 font-semibold" data-testid="commission-due-total">
          Due now: ₹{due.reduce((s, c) => s + c.amountDueInr, 0)} across {due.length} move-in{due.length === 1 ? "" : "s"}
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {(data?.items ?? []).map((c) => (
          <li key={c.id} className="rounded-2xl border border-line bg-card p-4" data-testid="owner-commission-row">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{c.listingTitle}</p>
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold">{LABEL[c.status] ?? c.status}</span>
            </div>
            <p className="mt-1 text-sm">{commissionLine(c)}</p>
            <p className="mt-1 text-sm text-muted">
              {c.tenantName} moved in {readableDate(c.moveInOn)} · due by {readableDate(c.dueOn)}
              {c.earlyExit && c.status !== "due_50" ? ` · tenant moved out ${readableDate(c.vacatedOn)}, so only 50% (₹${c.amountDueInr}) was due` : ""}
              {c.status === "due_50" ? ` · tenant moved out ${readableDate(c.vacatedOn)}, so only ₹${c.amountDueInr} (50%) is due` : ""}
              {c.status === "due" || c.status === "due_50" ? " · Roomeo will send you a Razorpay payment link" : ""}
              {c.paidOn ? ` · paid ₹${c.paidInr} on ${readableDate(c.paidOn)}` : ""}
              {c.refundedOn ? ` · ₹${c.refundInr} refunded ${readableDate(c.refundedOn)}` : ""}
            </p>
          </li>
        ))}
      </ul>
      {data && data.items.length === 0 ? <p className="mt-4 text-muted">No commissions yet.</p> : null}
    </Shell>
  );
}
