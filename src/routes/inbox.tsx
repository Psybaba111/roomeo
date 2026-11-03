import { pageHead } from "@/lib/seo";
import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { inr } from "@/lib/roomsetu/map";
import {
  listApplications,
  listConversations,
  openConversation,
  sendMessage,
  setApplication,
} from "@/lib/roomsetu/account-api";
import { getInboxSummary, getOwnerDeals } from "@/lib/roomsetu/owner-inbox-api";
import { INBOX_EMPTY } from "@/lib/roomsetu/owner-inbox";
import { THREAD_POLL_MS } from "@/lib/roomsetu/inbox";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/inbox")({
  head: () => pageHead("Inbox", { noindex: true }),
  component: () => (
    <NeedAccount next="/inbox">
      <OwnerInbox />
    </NeedAccount>
  ),
});

type Apps = Awaited<ReturnType<typeof listApplications>>;
type Threads = Awaited<ReturnType<typeof listConversations>>;
type Deals = Awaited<ReturnType<typeof getOwnerDeals>>;

const card = "min-w-0 rounded-3xl border border-line bg-card p-4";
const pill = "inline-flex h-12 shrink-0 items-center justify-center rounded-full px-5 text-sm font-semibold";

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-8 min-w-0">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        {title}
        {count ? <span className="rounded-full bg-brand px-2 text-sm text-card">{count}</span> : null}
      </h2>
      <ul className="mt-3 space-y-3">{children}</ul>
    </section>
  );
}

function ReplyBox({ onSend, placeholder }: { onSend: (text: string) => Promise<void>; placeholder: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-3 flex min-w-0 items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t || busy) return;
        setBusy(true);
        void onSend(t)
          .then(() => setText(""))
          .finally(() => setBusy(false));
      }}
    >
      <input
        className="h-12 min-w-0 flex-1 rounded-full border border-line bg-paper px-4"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <button type="submit" disabled={busy} className={`${pill} bg-brand text-card`}>
        {busy ? "…" : "Send"}
      </button>
    </form>
  );
}

function OwnerInbox() {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [apps, setApps] = useState<Apps | null>(null);
  const [threads, setThreads] = useState<Threads>([]);
  const [deals, setDeals] = useState<Deals | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [a, t, d] = await Promise.all([listApplications(), listConversations(), getOwnerDeals()]);
    setApps(a);
    setThreads(t);
    setDeals(d);
  }, []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void (async () => {
      try {
        const s = await getInboxSummary();
        if (!live) return;
        if (!s.isOwner) {
          void navigate({ to: "/dashboard", replace: true });
          return;
        }
        await load();
      } catch (e) {
        if (live) setError(errText(e));
      }
    })();
    const timer = setInterval(() => {
      void load().catch(() => undefined);
    }, THREAD_POLL_MS * 3);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [user, load, navigate]);

  if (error) {
    return (
      <Shell>
        <p className="text-danger">{error}</p>
      </Shell>
    );
  }
  if (!apps || !deals) {
    return (
      <Shell>
        <p className="text-muted">Opening your inbox…</p>
      </Shell>
    );
  }

  const requests = apps.filter((r) => !r.mine && r.status === "PENDING");
  const unread = threads.filter((t) => t.unread > 0);
  const nothing = !requests.length && !unread.length && !deals.deals.length;

  const decide = (id: string, status: "ACCEPTED" | "DECLINED") =>
    void setApplication({ data: { id, status } })
      .then(() => setNote(status === "ACCEPTED" ? "Accepted 🎉 Next up: the agreement." : "Declined. They'll get a heads up."))
      .then(load)
      .catch((e) => setNote(errText(e)));

  return (
    <Shell>
      <div className="min-w-0" data-testid="owner-inbox">
        <h1 className="font-display text-4xl">Inbox</h1>
        <p className="mt-1 text-sm text-muted">Requests, chats and payments for your beds. All in one spot.</p>
        {note ? (
          <p className="mt-3 rounded-2xl bg-brand-soft px-4 py-2 text-sm" role="status">
            {note}
          </p>
        ) : null}

        {nothing ? (
          <div className={`${card} mt-6 text-center`} data-testid="inbox-empty">
            <p className="font-display text-2xl">{INBOX_EMPTY}</p>
            {deals.beds[0] ? (
              <Link
                to="/listing/$id"
                params={{ id: deals.beds[0].id }}
                className={`${pill} mt-4 bg-brand text-card`}
              >
                Open my listing to share
              </Link>
            ) : null}
          </div>
        ) : null}

        {requests.length ? (
          <Section title="New requests 🔥" count={requests.length}>
            {requests.map((r) => (
              <li key={r.id} className={card} data-testid="inbox-request">
                <p className="truncate font-semibold">{r.seekerName}</p>
                <p className="break-words text-sm text-muted">
                  {r.title} · {inr(r.rent)}
                </p>
                {r.note ? <p className="mt-2 break-words text-sm">“{r.note}”</p> : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className={`${pill} bg-brand text-card`} onClick={() => decide(r.id, "ACCEPTED")}>
                    Accept
                  </button>
                  <button type="button" className={`${pill} border border-line`} onClick={() => decide(r.id, "DECLINED")}>
                    Decline
                  </button>
                </div>
                <ReplyBox
                  placeholder={`Reply to ${r.seekerName.split(" ")[0] || "them"}`}
                  onSend={async (text) => {
                    try {
                      const convo = await openConversation({
                        data: { listingId: r.listingId, roomWantedId: "", withUserId: r.seekerId },
                      });
                      await sendMessage({ data: { id: convo.id, body: text } });
                      setNote("Sent 💬");
                      await load();
                    } catch (e) {
                      setNote(errText(e));
                    }
                  }}
                />
              </li>
            ))}
          </Section>
        ) : null}

        {unread.length ? (
          <Section title="Unread chats" count={unread.length}>
            {unread.map((t) => (
              <li key={t.id} className={card} data-testid="inbox-chat">
                <Link to="/messages" search={{ thread: t.id }} className="block min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold">{t.otherName}</span>
                    <span className="shrink-0 rounded-full bg-brand px-2 text-xs text-card">{t.unread} new</span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted">{t.listingTitle}</span>
                  <span className="mt-2 block break-words text-sm">{t.lastBody}</span>
                </Link>
                <ReplyBox
                  placeholder="Quick reply"
                  onSend={async (text) => {
                    try {
                      await sendMessage({ data: { id: t.id, body: text } });
                      setNote("Sent 💬");
                      await load();
                    } catch (e) {
                      setNote(errText(e));
                    }
                  }}
                />
              </li>
            ))}
          </Section>
        ) : null}

        {deals.deals.length ? (
          <Section title="Waiting on payment" count={deals.deals.length}>
            {deals.deals.map((d) => (
              <li key={d.id} className={card} data-testid="inbox-deal">
                <p className="truncate font-semibold">{d.seekerName}</p>
                <p className="break-words text-xs text-muted">{d.title}</p>
                <p className="mt-2 text-sm">
                  <span className="font-semibold text-brand">{d.step}</span> · {d.hint}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/applications" className={`${pill} border border-line`}>
                    Open deal
                  </Link>
                  {deals.isAdmin && d.reviewable ? (
                    <a href="/admin/payments" className={`${pill} bg-brand text-card`}>
                      Approve
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </Section>
        ) : null}

        <Section title="Your beds" count={0}>
          {deals.beds.map((b) => (
            <li key={b.id} className={`${card} flex items-center justify-between gap-3`}>
              <div className="min-w-0">
                <p className="truncate font-semibold">{b.title}</p>
                <p className="text-xs text-muted">
                  {inr(b.rent)} · {b.status.toLowerCase()} · {b.views} views
                </p>
              </div>
              <Link to="/edit-listing/$id" params={{ id: b.id }} className={`${pill} bg-ink text-card`}>
                Edit
              </Link>
            </li>
          ))}
        </Section>
        <p className="mt-6 text-sm text-muted">
          Need saved beds, plans or earnings? <Link to="/dashboard" className="font-semibold text-brand">Your desk</Link> ·{" "}
          <Link to="/saved" className="font-semibold text-brand">Saved</Link>
        </p>
      </div>
    </Shell>
  );
}
