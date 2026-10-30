import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { ReferralCard } from "@/components/referral-card";
import { MoveInSection } from "@/components/move-in";
import { BoostPanel } from "@/components/host-extras";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { RoomCard } from "@/components/cards";
import { getPublicPricing, startPassCheckout } from "@/lib/roomsetu/pricing-api";
import { dashboardPasses, type DashboardPass } from "@/lib/roomsetu/dashboard-passes";
import { UpiCheckout, type UpiCheckoutData } from "@/components/upi-checkout";
import {
  ensureProfile,
  getDesk,
  listApplications,
  openConversation,
  setApplication,
  setListingStatus,
  updateProfile,
} from "@/lib/roomsetu/account-api";
import { COMING_SOON, HOST_WIDGETS, defaultLayout } from "@/lib/roomsetu/constants";
import { inr } from "@/lib/roomsetu/map";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/dashboard")({
  head: () => pageHead("Your desk", { noindex: true }),
  component: () => (
    <NeedAccount next="/dashboard">
      <Desk />
    </NeedAccount>
  ),
});

type DeskData = Awaited<ReturnType<typeof getDesk>>;

function Desk() {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [data, setData] = useState<DeskData | null>(null);
  const [apps, setApps] = useState<Awaited<ReturnType<typeof listApplications>>>([]);
  const [plans, setPlans] = useState<DashboardPass[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [checkout, setCheckout] = useState<UpiCheckoutData | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void (async () => {
      try {
        const raw = sessionStorage.getItem("roomsetu-extra");
        sessionStorage.removeItem("roomsetu-extra");
        const extra = raw
          ? (JSON.parse(raw) as { mobile?: string; city?: string; intent?: string })
          : null;
        const profile = await ensureProfile({
          data: {
            intent:
              extra?.intent === "LOOKING" ||
              extra?.intent === "OFFERING" ||
              extra?.intent === "BOTH"
                ? extra.intent
                : "BOTH",
          },
        });
        if (extra && (extra.mobile || extra.city)) {
          await updateProfile({
            data: {
              name: profile.name,
              mobile: extra.mobile || profile.mobile,
              age: profile.age,
              gender: profile.gender,
              city: extra.city || profile.city,
              occupation: profile.occupation,
              intent: extra.intent || profile.intent,
              preferredCities: profile.preferredCities,
              about: profile.about,
              lifestyle: profile.lifestyle,
              smoking: profile.smoking,
              pets: profile.pets,
              food: profile.food,
              budget: profile.budget,
              moveIn: profile.moveIn,
              roomPref: profile.roomPref,
              furnishedPref: profile.furnishedPref,
              showAge: profile.showAge,
              showOccupation: profile.showOccupation,
              showCity: profile.showCity,
              allowMessages: profile.allowMessages,
            },
          });
        }
        const desk = await getDesk();
        const priced = dashboardPasses(await getPublicPricing());
        const requests = await listApplications();
        if (!live) return;
        setData(desk);
        setPlans(priced);
        setApps(requests);
      } catch (e) {
        if (live) setError(errText(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [user]);

  async function refresh() {
    const [desk, requests] = await Promise.all([getDesk(), listApplications()]);
    setData(desk);
    setApps(requests);
  }

  if (error) {
    return (
      <Shell>
        <p className="text-danger">{error}</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <p className="text-muted">Opening your desk…</p>
      </Shell>
    );
  }

  const widgets = defaultLayout(HOST_WIDGETS);
  const hostish = data.profile.intent !== "LOOKING" || data.listings.length > 0;
  const incoming = apps.filter((row) => !row.mine && row.status === "PENDING");
  const tracking = apps.filter((row) => row.mine);

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand">Your desk</p>
          <h1 className="font-display text-4xl">{data.profile.name.split(" ")[0]}</h1>
          <p className="mt-1 text-muted">
            Profile {data.completion}% complete · {data.unread} unread
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/create-listing"
            className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-sm font-semibold text-card"
          >
            List a room
          </Link>
          <Link
            to="/create-room-wanted"
            className="inline-flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold"
          >
            I need a room
          </Link>
          {data.isAdmin ? (
            <Link
              to="/admin"
              className="inline-flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold"
            >
              Operator desk
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/saved" className="rounded-2xl border border-line bg-card p-4">
          <p className="text-sm text-muted">Saved</p>
          <p className="font-display text-3xl tabular-nums">{data.saved}</p>
        </Link>
        <Link to="/applications" className="rounded-2xl border border-line bg-card p-4">
          <p className="text-sm text-muted">Requests</p>
          <p className="font-display text-3xl tabular-nums">{data.applications}</p>
        </Link>
        <Link
          to="/messages"
          search={{ thread: "" }}
          className="rounded-2xl border border-line bg-card p-4"
        >
          <p className="text-sm text-muted">Messages</p>
          <p className="font-display text-3xl tabular-nums">{data.unread}</p>
        </Link>
        <Link to="/matches" className="rounded-2xl border border-line bg-card p-4">
          <p className="text-sm text-muted">Matches</p>
          <p className="font-display text-3xl">See</p>
        </Link>
      </div>

      <ReferralCard />

      <MoveInSection />

      {incoming.length ? (
        <section className="mt-6">
          <h2 className="font-display text-3xl">Enquiries waiting</h2>
          <ul className="mt-3 space-y-3">
            {incoming.map((row) => (
              <li key={row.id} className="rounded-3xl border border-line bg-card p-4">
                <p className="font-semibold">{row.seekerName}</p>
                <p className="text-sm text-muted">
                  {row.title} · {row.city} · {inr(row.rent)}
                </p>
                <p className="mt-2 text-sm">{row.note}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-10 rounded-full bg-brand px-3 text-sm font-semibold text-card"
                    onClick={() =>
                      void setApplication({ data: { id: row.id, status: "ACCEPTED" } })
                        .then(refresh)
                        .catch((e) => setNote(errText(e)))
                    }
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-full border border-line px-3 text-sm"
                    onClick={() =>
                      void setApplication({ data: { id: row.id, status: "DECLINED" } })
                        .then(refresh)
                        .catch((e) => setNote(errText(e)))
                    }
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-full border border-line px-3 text-sm"
                    onClick={() => {
                      void openConversation({
                        data: {
                          listingId: row.listingId,
                          roomWantedId: "",
                          withUserId: row.seekerId,
                        },
                      })
                        .then((convo) =>
                          navigate({ to: "/messages", search: { thread: convo.id } }),
                        )
                        .catch((e) => setNote(errText(e)));
                    }}
                  >
                    Message
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tracking.length ? (
        <section className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-3xl">Your applications</h2>
            <Link to="/applications" className="text-sm font-semibold text-brand">
              All requests
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {tracking.slice(0, 4).map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-sm"
              >
                <span>
                  {row.title} · {row.city}
                </span>
                <span className="font-semibold">{row.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.completion < 100 ? (
        <Link
          to="/profile"
          className="mt-4 block rounded-2xl bg-marigold-soft px-4 py-3 text-sm font-medium"
        >
          Finish your profile so matches can use your city, budget, and house rules.
        </Link>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display text-3xl">Recommended for you</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {data.recommended.map((item) => (
            <RoomCard key={item.card.id} room={item.card} score={item.match.score} />
          ))}
        </div>
        {data.recommended.length === 0 ? (
          <p className="mt-3 text-muted">Add a city and budget on your profile to see matches.</p>
        ) : null}
      </section>

      {hostish ? (
        <section className="mt-10">
          <h2 className="font-display text-3xl">Your rooms</h2>
          <ul className="mt-4 space-y-3">
            {data.listings.map((listing) => (
              <li
                key={listing.id}
                className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">{listing.title}</p>
                  <p className="text-sm text-muted">
                    {listing.city} · {inr(listing.rent)} · {listing.status} · {listing.views} views
                    · quality {listing.quality}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/listing/$id"
                    params={{ id: listing.id }}
                    className="inline-flex h-10 items-center rounded-full border border-line px-3 text-sm"
                  >
                    Open
                  </Link>
                  <Link
                    to="/edit-listing/$id"
                    params={{ id: listing.id }}
                    className="inline-flex h-10 items-center gap-1 rounded-full bg-ink px-3 text-sm font-semibold text-card"
                    data-testid="edit-listing"
                  >
                    Edit
                  </Link>
                  {listing.status !== "PAUSED" ? (
                    <button
                      type="button"
                      className="h-10 rounded-full border border-line px-3 text-sm"
                      onClick={() =>
                        void setListingStatus({ data: { id: listing.id, status: "PAUSED" } }).then(
                          refresh,
                        )
                      }
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="h-10 rounded-full border border-line px-3 text-sm"
                      onClick={() =>
                        void setListingStatus({ data: { id: listing.id, status: "ACTIVE" } }).then(
                          refresh,
                        )
                      }
                    >
                      Resume
                    </button>
                  )}
                  <button
                    type="button"
                    className="h-10 rounded-full border border-line px-3 text-sm"
                    onClick={() =>
                      void setListingStatus({ data: { id: listing.id, status: "OCCUPIED" } }).then(
                        refresh,
                      )
                    }
                  >
                    Occupied
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-full px-3 text-sm text-danger"
                    onClick={() =>
                      void setListingStatus({ data: { id: listing.id, status: "REMOVED" } }).then(
                        refresh,
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {data.listings.length === 0 ? (
            <p className="mt-3 text-muted">No rooms listed yet.</p>
          ) : null}
        </section>
      ) : null}

      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-line bg-card p-4">
          <h2 className="font-display text-2xl">Verification</h2>
          <p className="mt-2 text-sm text-muted">
            Status: {data.profile.verification}. A badge appears only after an operator marks the
            checks complete.
          </p>
          <Link to="/verification" className="mt-3 inline-block font-semibold text-brand">
            Open verification
          </Link>
        </div>
        <div className="rounded-3xl border border-line bg-card p-4">
          <h2 className="font-display text-2xl">Earnings</h2>
          <p className="mt-2 font-display text-3xl tabular-nums">{inr(0)}</p>
          <p className="text-sm text-muted">
            No rent has been collected on roomeo.com. That stays coming soon.
          </p>
        </div>
      </section>

      {plans.length ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Plans</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.code} className="rounded-2xl border border-line bg-card p-4">
                <p className="font-semibold">{plan.name}</p>
                <p className="text-sm text-muted">{plan.perks}</p>
                <p className="mt-2 tabular-nums">{inr(plan.price)}</p>
                {plan.action === "squad" ? (
                  <Link
                    to="/squads"
                    className="mt-3 inline-flex h-10 items-center rounded-full border border-line px-3 text-sm"
                  >
                    Start a squad
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="mt-3 h-10 rounded-full border border-line px-3 text-sm"
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

      {hostish ? <BoostPanel /> : null}

      <section className="mt-8">
        <h2 className="font-display text-2xl">Coming soon</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {COMING_SOON.map((item) => (
            <li
              key={item}
              className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted"
            >
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Desk sections: {widgets.map((w) => w.id).join(", ")}. Reorder the operator desk from
          Admin.
        </p>
      </section>

      {data.notifications.length ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Notices</h2>
          <ul className="mt-3 space-y-2">
            {data.notifications.map((n) => (
              <li key={n.id} className="rounded-2xl bg-card px-4 py-3 text-sm">
                <span className="font-semibold">{n.title}.</span> {n.body}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}
