import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  blockUser,
  fileReport,
  listApplications,
  listConversations,
  listMessages,
  sendMessage,
} from "@/lib/roomsetu/account-api";
import { REPORT_CATEGORIES } from "@/lib/roomsetu/constants";
import { signedInLine, THREAD_POLL_MS } from "@/lib/roomsetu/inbox";
import { pinnedRequestFor, requestStatusLabel } from "@/lib/roomsetu/booking-cta";
import { inr } from "@/lib/roomsetu/map";

export const Route = createFileRoute("/messages")({
  head: () => pageHead("Messages", { noindex: true }),
  validateSearch: (search: Record<string, unknown>): { thread: string; view?: "requests" } => ({
    thread: typeof search.thread === "string" ? search.thread : "",
    ...(search.view === "requests" ? { view: "requests" as const } : {}),
  }),
  component: () => (
    <NeedAccount next="/messages">
      <Inbox />
    </NeedAccount>
  ),
});

function Inbox() {
  const { user } = useCurrentUserState();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [threads, setThreads] = useState<Awaited<ReturnType<typeof listConversations>>>([]);
  const [msgs, setMsgs] = useState<Awaited<ReturnType<typeof listMessages>>>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [category, setCategory] = useState<string>(REPORT_CATEGORIES[0]);
  const [apps, setApps] = useState<Awaited<ReturnType<typeof listApplications>>>([]);
  const showRequests = search.view === "requests";

  async function loadThreads() {
    setThreads(await listConversations());
  }

  useEffect(() => {
    if (!user) return;
    void listApplications().then(setApps).catch(() => undefined);
  }, [user, search.thread, search.view]);

  useEffect(() => {
    if (!user) return;
    void loadThreads().catch((e) => setError(errText(e)));
    // New conversations started by someone else appear without a reload.
    const timer = window.setInterval(() => void loadThreads().catch(() => {}), THREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (!user || !search.thread) return;
    let live = true;
    const pull = () => {
      void listMessages({ data: search.thread })
        .then((rows) => {
          if (live) setMsgs(rows);
        })
        .catch((e) => {
          if (live) setError(errText(e));
        });
    };
    pull();
    const timer = window.setInterval(pull, 2500);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [user, search.thread]);

  const active = threads.find((t) => t.id === search.thread);
  const pinned = pinnedRequestFor(apps, active);

  return (
    <Shell>
      <h1 className="font-display text-4xl">Messages</h1>
      <p className="mt-1 text-sm text-muted">
        Messages refresh live. Phone numbers are not shared here.
      </p>
      {user && signedInLine(user.displayName, user.primaryEmail) ? (
        <p className="mt-1 text-xs text-muted" data-testid="inbox-account">
          {signedInLine(user.displayName, user.primaryEmail)}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 flex gap-2" role="tablist" aria-label="Show">
        <button type="button" role="tab" aria-selected={!showRequests} data-testid="chip-chats"
          className={`inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold ${!showRequests ? "bg-ink text-card" : "border border-line bg-card"}`}
          onClick={() => void navigate({ search: { thread: search.thread } })}>
          Chats
        </button>
        <button type="button" role="tab" aria-selected={showRequests} data-testid="chip-requests"
          className={`inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold ${showRequests ? "bg-ink text-card" : "border border-line bg-card"}`}
          onClick={() => void navigate({ search: { thread: "", view: "requests" } })}>
          Requests{apps.length ? ` · ${apps.length}` : ""}
        </button>
      </div>
      {showRequests ? (
        <ul className="mt-4 min-w-0 space-y-3" data-testid="requests-list">
          {apps.length === 0 ? (
            <li className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">
              No requests yet. Find a bed you like and tap “Request this bed” 🛏️
            </li>
          ) : null}
          {apps.map((a) => {
            const thread = threads.find((t) => t.listingId === a.listingId && t.otherId === (a.mine ? a.hostId : a.seekerId));
            return (
              <li key={a.id} className="min-w-0 rounded-2xl border border-line bg-card p-4" data-testid="request-row">
                <p className="break-words font-semibold">{a.title}</p>
                <p className="text-xs text-muted">
                  {a.mine ? "You asked" : `${a.seekerName} asked`} · {a.city} · {inr(a.rent)}/mo
                </p>
                <p className="mt-2 inline-block rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-deep">
                  {requestStatusLabel(a.status, a.mine)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {thread ? (
                    <button type="button" className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-sm font-semibold text-card"
                      onClick={() => void navigate({ search: { thread: thread.id } })}>
                      Open chat
                    </button>
                  ) : null}
                  <Link to="/applications" className="inline-flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold">
                    Deal steps →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className={`mt-4 ${showRequests ? "hidden" : "grid"} min-w-0 grid-cols-1 gap-4 lg:grid-cols-12`} data-testid="messages-grid">
        <ul className="min-w-0 space-y-2 lg:col-span-4">
          {threads.length === 0 ? (
            <li className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">
              No chats yet. Open a bed and tap “Request this bed”, the chat with the owner opens right here. Your requests live under the Requests chip ☝️
            </li>
          ) : null}
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void navigate({ search: { thread: t.id } })}
                className={`w-full min-w-0 rounded-2xl border px-4 py-3 text-left ${t.id === search.thread ? "border-brand bg-brand-soft" : "border-line bg-card"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-semibold">{t.otherName}</span>
                  {t.unread ? (
                    <span className="rounded-full bg-brand px-2 text-xs text-card">{t.unread}</span>
                  ) : null}
                </span>
                <span className="mt-1 block truncate text-sm text-muted">
                  {t.lastBody || t.listingTitle || "New conversation"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 lg:col-span-8">
          {!search.thread ? <p className="text-muted">Choose a conversation.</p> : null}
          {search.thread ? (
            <div className="flex min-h-96 w-full min-w-0 max-w-full flex-col overflow-x-hidden rounded-3xl border border-line bg-card" data-testid="thread-pane">
              <div className="bg-paper px-4 py-3">
                <p className="truncate font-semibold">{active?.otherName ?? "Conversation"}</p>
                <p className="line-clamp-2 break-words text-xs text-muted">
                  {active?.listingTitle}
                  {active?.otherSeen
                    ? ` · last active ${active.otherSeen.slice(0, 16).replace("T", " ")}`
                    : ""}
                  {active?.otherDemo ? " · sample host" : ""}
                </p>
              </div>
              {pinned ? (
                <div className="mx-3 mt-3 min-w-0 rounded-2xl border-2 border-brand bg-brand-soft px-4 py-3" data-testid="pinned-request">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-deep">📌 Bed request</p>
                  <p className="mt-1 break-words text-sm font-semibold">{pinned.title}</p>
                  <p className="text-xs text-muted">{inr(pinned.rent)}/mo · {inr(pinned.deposit)} deposit to the owner</p>
                  <p className="mt-1 text-sm">{requestStatusLabel(pinned.status, pinned.mine)}</p>
                  <Link to="/applications" className="mt-2 inline-flex h-10 items-center rounded-full bg-card px-4 text-sm font-semibold">
                    {pinned.mine ? "See deal steps →" : "Accept or decline →"}
                  </Link>
                </div>
              ) : null}
              <ul className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                {msgs.map((m) => (
                  <li
                    key={m.id}
                    className={`max-w-[80%] break-words [overflow-wrap:anywhere] rounded-2xl px-3 py-2 text-sm ${m.mine ? "self-end bg-brand text-card" : "self-start bg-paper"}`}
                  >
                    {active?.isSquad && !m.mine && m.senderName ? (
                      <p className="text-xs font-semibold text-brand">{m.senderName}</p>
                    ) : null}
                    <p>{m.body}</p>
                    <p className={`mt-1 text-xs ${m.mine ? "text-brand-soft" : "text-muted"}`}>
                      {m.at.replace("T", " ")}
                      {m.kind === "QUICK_REPLY" ? " · quick reply" : ""}
                    </p>
                  </li>
                ))}
              </ul>
              <form
                className="flex min-w-0 items-center gap-2 bg-paper p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = body.trim();
                  if (!text || !user) return;
                  setBody("");
                  const optimistic = {
                    id: `local-${Date.now()}`,
                    senderId: user.id,
                    senderName: "",
                    body: text,
                    kind: "TEXT",
                    at: new Date().toISOString().slice(0, 16),
                    mine: true,
                  };
                  setMsgs((cur) => [...cur, optimistic]);
                  void sendMessage({ data: { id: search.thread, body: text } })
                    .then(() => listMessages({ data: search.thread }))
                    .then(setMsgs)
                    .then(loadThreads)
                    .catch((err) => setError(errText(err)));
                }}
              >
                <input
                  className="h-12 min-w-0 flex-1 rounded-full border border-line bg-paper px-4"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write a message"
                />
                <button
                  className="h-12 shrink-0 rounded-full bg-brand px-4 font-semibold text-card"
                  type="submit"
                >
                  Send
                </button>
              </form>
              {active ? (
                <div className="flex min-w-0 flex-wrap items-center gap-3 px-4 pb-4 text-sm">
                  <button
                    type="button"
                    className="text-danger"
                    onClick={() =>
                      void blockUser({ data: active.otherId })
                        .then(() => setError("Blocked. You will not get further messages through."))
                        .catch((e) => setError(errText(e)))
                    }
                  >
                    Block
                  </button>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="min-w-0 max-w-full rounded-full border border-line bg-paper px-2"
                  >
                    {REPORT_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      void fileReport({
                        data: {
                          targetType: "USER",
                          targetId: active.otherId,
                          category,
                          note: "Reported from messages",
                        },
                      })
                        .then(() => setError("Report filed."))
                        .catch((e) => setError(errText(e)))
                    }
                  >
                    Report
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}
