import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { NeedAccount } from "@/components/need-account";
import { errText } from "@/lib/ui-text";
import { joinSquad, squadPreview } from "@/lib/roomsetu/squad-api";

export const Route = createFileRoute("/squads/join/$code")({
  head: () => pageHead("Join a squad", { noindex: true }),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  return (
    <NeedAccount next={`/squads/join/${code}`}>
      <Join code={code} />
    </NeedAccount>
  );
}

function Join({ code }: { code: string }) {
  const navigate = useNavigate();
  const [p, setP] = useState<Awaited<ReturnType<typeof squadPreview>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void squadPreview({ data: { code } })
      .then(setP)
      .catch((e) => setError(errText(e)));
  }, [code]);
  return (
    <Shell>
      <div className="mx-auto max-w-md rounded-3xl border border-line bg-card p-6 text-center">
        <p className="text-4xl" aria-hidden="true">
          🏠
        </p>
        {p ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold">Join “{p.name}”</h1>
            <p className="mt-1 text-muted">
              {p.area} · ₹{p.budget.toLocaleString("en-IN")}/person · {p.members.length}/{p.size} in{" "}
              {p.moveIn ? `· move-in ${p.moveIn.slice(0, 10)}` : ""}
            </p>
            <p className="mt-2 text-sm">With {p.members.join(", ")}</p>
            {p.alreadyMember ? (
              <Link
                to="/squads/$id"
                params={{ id: p.id }}
                className="mt-4 inline-flex h-12 items-center rounded-full bg-brand px-6 font-semibold text-card"
              >
                Open squad
              </Link>
            ) : !p.phoneVerified ? (
              <p className="mt-4 rounded-2xl bg-marigold-soft p-3 text-sm">
                Verify your phone first, then come back to this link.{" "}
                <Link to="/verification" className="font-semibold underline">
                  Verify phone
                </Link>
              </p>
            ) : p.members.length >= p.size ? (
              <p className="mt-4 text-muted">This squad is full.</p>
            ) : (
              <button
                type="button"
                className="mt-4 h-12 rounded-full bg-brand px-6 font-semibold text-card"
                onClick={() =>
                  void joinSquad({ data: { code } })
                    .then((r) => navigate({ to: "/squads/$id", params: { id: r.id } }))
                    .catch((e) => setError(errText(e)))
                }
              >
                Join squad
              </button>
            )}
          </>
        ) : null}
        {error ? (
          <p className="mt-3 text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Shell>
  );
}
