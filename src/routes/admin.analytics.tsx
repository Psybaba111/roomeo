import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { AdminFrame } from "@/components/admin-frame";
import { GrowthChart } from "@/components/growth-chart";
import { errText } from "@/components/shell";
import { adminOverview } from "@/lib/roomsetu/admin-api";
import { inr } from "@/lib/roomsetu/map";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/analytics")({
  component: () => (
    <NeedAccount next="/admin/analytics">
      <Charts />
    </NeedAccount>
  ),
});

function Charts() {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof adminOverview>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    void adminOverview().then(setData).catch((e) => setError(errText(e)));
  }, [user]);
  return (
    <AdminFrame>
      <h1 className="font-display text-4xl">Charts</h1>
      <p className="mt-2 text-sm text-muted">Weekly counts from the database. Revenue stays at zero until a payment is actually captured.</p>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      {data ? (
        <>
          <div className="mt-4 rounded-3xl border border-line bg-card p-4">
            <GrowthChart data={data.series} />
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Match rows", data.matches],
              ["Enquiry rate", `${data.enquiryRate}%`],
              ["Avg deposit", inr(data.avgDeposit)],
              ["Paid-tier rooms", data.paidListings],
              ["Occupied", data.roomsOccupied],
              ["Messages", data.messages],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-2xl border border-line bg-card p-4">
                <dt className="text-sm text-muted">{k}</dt>
                <dd className="font-display text-2xl tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </AdminFrame>
  );
}
