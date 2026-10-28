import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  blockUser,
  fileReport,
  listConversations,
  listMessages,
  sendMessage,
} from "@/lib/roomsetu/account-api";
import { REPORT_CATEGORIES } from "@/lib/roomsetu/constants";

export const Route = createFileRoute("/messages")({
  head: () => pageHead("Messages", { noindex: true }),
  validateSearch: (search: Record<string, unknown>) => ({
    thread: typeof search.thread === "string" ? search.thread : "",
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

  async function loadThreads() {
    setThreads(await listConversations());
  }

  useEffect(() => {
    if (!user) return;
    void loadThreads().catch((e) => setError(errText(e)));
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

  return (
    <Shell>
      <h1 className="font-display text-4xl">Messages</h1>
      <p className="mt-1 text-sm text-muted">
        Messages refresh live. Phone numbers are not shared here.
      </p>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-5 grid gap-4 lg:grid-cols-12">
        <ul className="space-y-2 lg:col-span-4">
          {threads.length === 0 ? (
            <li className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">
              No conversations yet. Open a room and message the host.
            </li>
          ) : null}
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void navigate({ search: { thread: t.id } })}
                className={`w-full rounded-2xl border px-4 py-3 text-left ${t.id === search.thread ? "border-brand bg-brand-soft" : "border-line bg-card"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{t.otherName}</span>
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
        <div className="lg:col-span-8">
          {!search.thread ? <p className="text-muted">Choose a conversation.</p> : null}
          {search.thread ? (
            <div className="flex min-h-96 flex-col rounded-3xl border border-line bg-card">
              <div className="border-b border-line px-4 py-3">
                <p className="font-semibold">{active?.otherName ?? "Conversation"}</p>
                <p className="text-xs text-muted">
                  {active?.listingTitle}
                  {active?.otherSeen
                    ? ` · last active ${active.otherSeen.slice(0, 16).replace("T", " ")}`
                    : ""}
                  {active?.otherDemo ? " · sample host" : ""}
                </p>
              </div>
              <ul className="flex flex-1 flex-col gap-2 p-4">
                {msgs.map((m) => (
                  <li
                    key={m.id}
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "self-end bg-brand text-card" : "self-start bg-paper"}`}
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
                className="flex gap-2 border-t border-line p-3"
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
                  className="h-12 flex-1 rounded-full border border-line bg-paper px-4"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write a message"
                />
                <button
                  className="h-12 rounded-full bg-brand px-4 font-semibold text-card"
                  type="submit"
                >
                  Send
                </button>
              </form>
              {active ? (
                <div className="flex flex-wrap gap-3 px-4 pb-4 text-sm">
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
                    className="rounded-full border border-line bg-paper px-2"
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
