import { pageHead } from "@/lib/seo";
import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { DealAgreement } from "@/components/deal-agreement";
import { MoveIn } from "@/components/move-in-confirm";
import { errText } from "@/lib/ui-text";
import { inr } from "@/lib/roomsetu/map";
import { readableDate } from "@/lib/roomsetu/dates";
import { listConversations, openConversation } from "@/lib/roomsetu/account-api";
import { myMoveIns } from "@/lib/roomsetu/pricing-api";
import { getActivityDeals } from "@/lib/roomsetu/activity-api";
import { getInboxSummary } from "@/lib/roomsetu/owner-inbox-api";
import { applySignupExtras } from "@/lib/roomsetu/signup-extras";
import { ACTIVITY_FEE_LINE, activityRow, byGroup, primaryAction } from "@/lib/roomsetu/activity";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { btnSmall, btnSmallPrimary, card, inner } from "@/components/ui-tokens";

export const Route = createFileRoute("/activity")({
  head: () => pageHead("Your activity", { noindex: true }),
  component: () => (
    <NeedAccount next="/activity">
      <Activity />
    </NeedAccount>
  ),
});

type Deals = Awaited<ReturnType<typeof getActivityDeals>>;
type Row = ReturnType<typeof activityRow<Deals["rows"][number]>>;
type Threads = Awaited<ReturnType<typeof listConversations>>;
type MoveInfo = Awaited<ReturnType<typeof myMoveIns>>;

function Activity() {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [data, setData] = useState<Deals | null>(null);
  const [threads, setThreads] = useState<Threads>([]);
  const [moves, setMoves] = useState<MoveInfo | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  const load = useCallback(async () => {
    // Renters land here straight after sign-up, so the mobile/city they typed
    // there still has to be saved before anything else.
    await applySignupExtras().catch(() => undefined);
    const [deals, t, inbox] = await Promise.all([
      getActivityDeals(),
      listConversations().catch(() => []),
      getInboxSummary().catch(() => ({ isOwner: false })),
    ]);
    setData(deals);
    setThreads(t);
    setIsOwner(inbox.isOwner);
    void myMoveIns().then(setMoves).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void load().catch((e) => {
      if (live) setError(errText(e));
    });
    return () => {
      live = false;
    };
  }, [user, load]);

  async function chatTo(row: Row) {
    const thread = threads.find((t) => t.listingId === row.deal.listingId && t.otherName === row.deal.otherName);
    if (thread) {
      void navigate({ to: "/messages", search: { thread: thread.id } });
      return;
    }
    try {
      const convo = await openConversation({ data: { listingId: row.deal.listingId, roomWantedId: "", withUserId: "" } });
      void navigate({ to: "/messages", search: { thread: convo.id } });
    } catch (e) {
      setError(errText(e));
    }
  }

  if (error && !data) {
    return (
      <Shell>
        <p className="text-danger" role="alert">{error}</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <h1 className="font-display text-4xl">Activity</h1>
        <p className="mt-2 text-muted">Loading your deals…</p>
      </Shell>
    );
  }

  const rows = data.rows.map((deal) => activityRow(deal, deal.facts));
  const groups = byGroup(rows);
  const needsYou = rows.filter((r) => r.group === "needs-you").length;

  return (
    <Shell>
      <div className="min-w-0" data-testid="activity-page">
        <header className="min-w-0">
          <h1 className="font-display text-4xl">Activity</h1>
          <p className="mt-1 text-sm text-muted [text-wrap:pretty]">
            {needsYou
              ? `${needsYou} thing${needsYou === 1 ? "" : "s"} waiting on you. Everything else is ticking along.`
              : "Every bed you've asked about, in one list. One button per row, that's it."}
          </p>
        </header>

        {isOwner ? (
          <Link
            to="/inbox"
            className={`${card} mt-4 flex items-center justify-between gap-3`}
            data-testid="activity-host-link"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {data.hostPending
                  ? `${data.hostPending} request${data.hostPending === 1 ? "" : "s"} on your beds`
                  : "You host too"}
              </span>
              <span className="block text-sm text-muted">Owner side lives in your Inbox.</span>
            </span>
            <span className={`${btnSmall} shrink-0`}>Open</span>
          </Link>
        ) : null}

        {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}

        {rows.length === 0 ? (
          <div className={`${card} mt-6 text-center`} data-testid="activity-empty">
            <p className="font-display text-2xl">Nothing in motion yet 👀</p>
            <p className="mt-2 text-sm text-muted [text-wrap:pretty]">
              Find a bed you like, tap “Request this bed”, and it lands here with the next step.
            </p>
            <Link to="/search" search={{ city: "", locality: "", maxRent: "", roomType: "", furnished: "", gender: "", food: "", kind: "", sort: "recommended", q: "", availableBy: "" }} className={`${btnSmallPrimary} mt-4`}>
              Browse beds
            </Link>
          </div>
        ) : null}

        {groups.map((g) => (
          <section key={g.key} className="mt-6 min-w-0" data-testid={`activity-group-${g.key}`}>
            <h2 className="flex items-baseline gap-2 font-display text-2xl">
              {g.label}
              <span className="text-sm font-semibold text-muted">{g.rows.length}</span>
            </h2>
            <p className="text-xs text-muted">{g.blurb}</p>
            <ul className="mt-3 space-y-3">
              {g.rows.map((row) => (
                <DealCard
                  key={row.deal.id}
                  row={row}
                  open={openId === row.deal.id}
                  onToggle={() => setOpenId(openId === row.deal.id ? "" : row.deal.id)}
                  onChat={() => void chatTo(row)}
                  moves={moves}
                  reloadMoves={() => void myMoveIns().then(setMoves).catch(() => undefined)}
                  refresh={() => void load().catch((e) => setError(errText(e)))}
                />
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-8 rounded-2xl bg-paper px-4 py-3 text-xs text-muted [text-wrap:pretty]" data-testid="activity-fee-line">
          {ACTIVITY_FEE_LINE}
        </p>
      </div>
    </Shell>
  );
}

function DealCard({
  row,
  open,
  onToggle,
  onChat,
  moves,
  reloadMoves,
  refresh,
}: {
  row: Row;
  open: boolean;
  onToggle: () => void;
  onChat: () => void;
  moves: MoveInfo | null;
  reloadMoves: () => void;
  refresh: () => void;
}) {
  const d = row.deal;
  const action = primaryAction(row);
  const accepted = d.status === "ACCEPTED";
  const showMoveIn = accepted && row.current?.key === "movein";

  return (
    <li className={card} data-testid="activity-row" data-status={d.status} data-group={row.group}>
      <div className="flex min-w-0 gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-brand-soft">
          {d.photo ? (
            <img src={d.photo} alt="" width={64} height={64} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center px-1 text-center text-[10px] font-semibold text-brand-deep">
              {d.locality || d.city}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link to="/listing/$id" params={{ id: d.listingId }} className="block truncate font-semibold underline-offset-4 hover:underline">
            {d.title}
          </Link>
          <p className="truncate text-sm text-muted">
            {d.locality ? `${d.locality}, ` : ""}{d.city} · {inr(d.rent)}/mo
          </p>
          <p className="truncate text-xs text-muted">Owner · {d.otherName}</p>
          <p className="mt-1 text-sm font-medium" data-testid="activity-status-line">{row.statusLine}</p>
          {row.current && accepted && !d.facts.cancelled ? (
            <p className="mt-1 text-xs text-muted [text-wrap:pretty]" data-testid="activity-step-hint">
              <span className="font-semibold text-brand">Step: {row.current.label}</span> · {row.current.hint}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
        {action.kind === "none" ? (
          <button type="button" className={btnSmallPrimary} onClick={onToggle}>
            {open ? "Hide" : action.label}
          </button>
        ) : action.kind === "chat" ? (
          <button type="button" className={btnSmallPrimary} onClick={onChat} data-testid="activity-primary">
            {action.label}
          </button>
        ) : (
          <button type="button" className={btnSmallPrimary} onClick={onToggle} data-testid="activity-primary">
            {open ? "Hide" : action.label}
          </button>
        )}
        {accepted ? (
          <button type="button" className={btnSmall} onClick={onToggle} data-testid="activity-details">
            {open ? "Close" : "Deal details"}
          </button>
        ) : null}
        <span className="text-xs text-muted">{d.createdOn ? readableDate(d.createdOn) : ""}</span>
      </div>

      {open && accepted && !d.demo ? (
        <div className="mt-3 min-w-0 border-t border-line pt-3" data-testid="activity-details-panel">
          <p className={`${inner} text-sm`}>
            Rent {inr(d.rent)}/month + {inr(d.deposit)} deposit, paid straight to the owner. Roomeo never takes a cut of the rent.
          </p>
          <DealAgreement dealRef={{ kind: "app", id: d.id }} />
          {showMoveIn ? (
            <MoveIn applicationId={d.id} mine info={moves} reload={() => { reloadMoves(); refresh(); }} />
          ) : null}
        </div>
      ) : null}
      {d.demo ? (
        <p className="mt-2 text-xs text-muted">Sample bed · rent is not collected here.</p>
      ) : null}
    </li>
  );
}
