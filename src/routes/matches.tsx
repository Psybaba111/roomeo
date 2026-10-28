import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { RoomCard } from "@/components/cards";
import { getMatches } from "@/lib/roomsetu/account-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/matches")({
  head: () => pageHead("Your matches", { noindex: true }),
  component: () => (
    <NeedAccount next="/matches">
      <Matches />
    </NeedAccount>
  ),
});

function Matches() {
  const { user } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof getMatches>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    void getMatches().then(setData).catch((e) => setError(errText(e)));
  }, [user]);
  return (
    <Shell>
      <h1 className="font-display text-4xl">Matches</h1>
      <p className="mt-2 max-w-xl text-muted">A simple rules score using city, budget, move in, room type, and house rules. Not a black box ranking.</p>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      {data && !data.ready ? <p className="mt-4">Add a city and a budget on your profile first.</p> : null}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {data?.matches.map((item) => (
          <div key={item.card.id}>
            <RoomCard room={item.card} score={item.match.score} />
            <ul className="mt-2 grid grid-cols-2 gap-2 px-1 text-sm text-muted">
              {item.match.reasons.map((r) => (
                <li key={r.label}><span className="text-ink">{r.label}.</span> {r.detail}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Shell>
  );
}
