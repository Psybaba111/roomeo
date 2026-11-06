import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { BoostPanel } from "@/components/host-extras";
import { PgOpsSection } from "@/components/pg-ops";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { MoveInSection } from "@/components/move-in";
import { ComplaintsReceiptsSection } from "@/components/complaints-receipts";
import { getDesk, setListingStatus } from "@/lib/roomsetu/account-api";
import { applySignupExtras } from "@/lib/roomsetu/signup-extras";
import { getInboxSummary } from "@/lib/roomsetu/owner-inbox-api";
import { inr } from "@/lib/roomsetu/map";
import { getPublicPricing, startPassCheckout } from "@/lib/roomsetu/pricing-api";
import { dashboardPasses, type DashboardPass } from "@/lib/roomsetu/dashboard-passes";
import { UpiCheckout, type UpiCheckoutData } from "@/components/upi-checkout";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { btnSmall, card } from "@/components/ui-tokens";

/**
 * /dashboard is the owner's "My beds" screen now. Renters are sent to
 * /activity by the gate below, so old bookmarks and the post-sign-in redirect
 * still land somewhere useful.
 */
export const Route = createFileRoute("/dashboard")({
  head: () => pageHead("My beds", { noindex: true }),
  component: () => (
    <NeedAccount next="/dashboard">
      <MyBeds />
    </NeedAccount>
  ),
});

type DeskData = Awaited<ReturnType<typeof getDesk>>;

function MyBeds() {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [data, setData] = useState<DeskData | null>(null);
  const [plans, setPlans] = useState<DashboardPass[]>([]);
  const [checkout, setCheckout] = useState<UpiCheckoutData | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!user) return;
    let live = true;
    void (async () => {
      try {
        const summary = await getInboxSummary();
        if (!live) return;
        if (!summary.isOwner) {
          void navigate({ to: "/activity", replace: true });
          return;
        }
        await applySignupExtras();
        const desk = await getDesk();
        const priced = dashboardPasses(await getPublicPricing()).filter((p) => p.action === "squad" || p.action === "pay");
        if (!live) return;
        setData(desk);
        setPlans(priced);
      } catch (e) {
        if (live) setError(errText(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [user, navigate]);

  async function refresh() {
    setData(await getDesk());
  }

  if (error) {
    return (
      <Shell>
        <p className="text-danger" role="alert">{error}</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <h1 className="font-display text-4xl">My beds</h1>
        <p className="mt-2 text-muted">Opening your beds…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="min-w-0" data-testid="my-beds">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand">Hosting</p>
            <h1 className="font-display text-4xl">My beds</h1>
            <p className="mt-1 text-sm text-muted">
              {data.listings.length} live listing{data.listings.length === 1 ? "" : "s"} · profile {data.completion}% done
            </p>
          </div>
          <Link to="/create-listing" className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-sm font-semibold text-card">
            List a bed
          </Link>
        </div>

        <p className="mt-3 text-sm">
          <Link to="/inbox" className="font-semibold text-brand">Requests and chats live in your Inbox →</Link>
          {" · "}
          <Link to="/activity" className="font-semibold text-brand">Renting too? Your Activity</Link>
        </p>

        <PgOpsSection />

        <section className="mt-6 min-w-0">
          <h2 className="font-display text-3xl">Your rooms</h2>
          <ul className="mt-3 space-y-3">
            {data.listings.map((listing) => (
              <li key={listing.id} className={card} data-testid="my-bed-row">
                <div className="flex min-w-0 gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-brand-soft">
                    {listing.photo ? (
                      <img src={listing.photo} alt="" width={64} height={64} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center px-1 text-center text-[10px] font-semibold text-brand-deep">
                        {listing.locality || listing.city}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{listing.title}</p>
                    <p className="truncate text-sm text-muted">
                      {listing.city} · {inr(listing.rent)} · {listing.status.toLowerCase()} · {listing.views} views
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/listing/$id" params={{ id: listing.id }} className={btnSmall}>
                    Open
                  </Link>
                  <Link to="/edit-listing/$id" params={{ id: listing.id }} className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-card" data-testid="edit-listing">
                    Edit
                  </Link>
                  {listing.status !== "PAUSED" ? (
                    <button type="button" className={btnSmall} onClick={() => void setListingStatus({ data: { id: listing.id, status: "PAUSED" } }).then(refresh).catch((e) => setNote(errText(e)))}>
                      Pause
                    </button>
                  ) : (
                    <button type="button" className={btnSmall} onClick={() => void setListingStatus({ data: { id: listing.id, status: "ACTIVE" } }).then(refresh).catch((e) => setNote(errText(e)))}>
                      Resume
                    </button>
                  )}
                  <button type="button" className={btnSmall} onClick={() => void setListingStatus({ data: { id: listing.id, status: "OCCUPIED" } }).then(refresh).catch((e) => setNote(errText(e)))}>
                    Occupied
                  </button>
                  <button type="button" className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-danger" onClick={() => void setListingStatus({ data: { id: listing.id, status: "REMOVED" } }).then(refresh).catch((e) => setNote(errText(e)))}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {data.listings.length === 0 ? (
            <p className="mt-3 text-muted">No beds listed yet. Add one and it shows up here.</p>
          ) : null}
          {note ? <p className="mt-3 text-sm text-danger" role="alert">{note}</p> : null}
        </section>

        <section className="mt-8 grid gap-3 md:grid-cols-2">
          <div className={card}>
            <h2 className="font-display text-2xl">Verification</h2>
            <p className="mt-2 text-sm text-muted">
              Status: {data.profile.verification}. A badge appears only after an operator marks the checks complete.
            </p>
            <Link to="/verification" className="mt-3 inline-block font-semibold text-brand">
              Open verification
            </Link>
          </div>
          <div className={card}>
            <h2 className="font-display text-2xl">Saved &amp; squad</h2>
            <p className="mt-2 text-sm text-muted">Beds you bookmarked, and hunting with friends.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/search" search={{ city: "", locality: "", maxRent: "", roomType: "", furnished: "", gender: "", food: "", kind: "", sort: "recommended", q: "", availableBy: "", saved: "1" }} className={btnSmall}>
                Saved beds
              </Link>
              <Link to="/squads" className={btnSmall}>
                Squads
              </Link>
              <Link to="/room-wanted" className={btnSmall}>
                Room-wanted board
              </Link>
            </div>
          </div>
        </section>

        <MoveInSection />
        <ComplaintsReceiptsSection />

        {plans.length ? (
          <section className="mt-8">
            <h2 className="font-display text-2xl">Plans</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {plans.map((plan) => (
                <div key={plan.code} className={card}>
                  <p className="font-semibold">{plan.name}</p>
                  <p className="text-sm text-muted">{plan.perks}</p>
                  <p className="mt-2 tabular-nums">{inr(plan.price)}</p>
                  {plan.action === "squad" ? (
                    <Link to="/squads" className={`${btnSmall} mt-3`}>
                      Start a squad
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={`${btnSmall} mt-3`}
                      onClick={() => {
                        setNote("");
                        void startPassCheckout({ data: { code: plan.code } })
                          .then(setCheckout)
                          .catch((e) => setNote(errText(e)));
                      }}
                    >
                      Pay by UPI
                    </button>
                  )}
                </div>
              ))}
            </div>
            {checkout ? <UpiCheckout data={checkout} onClose={() => setCheckout(null)} /> : null}
            {note ? <p className="mt-3 text-sm">{note}</p> : null}
          </section>
        ) : null}

        <BoostPanel />

        {data.notifications.length ? (
          <section className="mt-8" id="notices">
            <h2 className="font-display text-2xl">Notices</h2>
            <ul className="mt-3 space-y-2">
              {data.notifications.map((n) => (
                <li key={n.id} className="rounded-2xl bg-card px-4 py-3 text-sm">
                  <span className="font-semibold">{n.title}.</span> {n.body}
                  {n.href && n.href.startsWith("/") && !n.href.startsWith("//") ? (
                    <>
                      {" "}
                      <a href={n.href} className="font-semibold underline" data-testid="notice-link">
                        {n.href.startsWith("/invoice/") ? "Get invoice" : "Open"}
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Shell>
  );
}
