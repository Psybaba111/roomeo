import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { HouseLine } from "@phosphor-icons/react";
import { Shell } from "@/components/shell";
import { NeedAccount } from "@/components/need-account";
import { errText } from "@/lib/ui-text";
import { joinSquad, squadPreview } from "@/lib/roomsetu/squad-api";
import { btnPrimary, card, errorBox, inner, linkCls, skeleton } from "@/components/ui-tokens";

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
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void squadPreview({ data: { code } })
      .then(setP)
      .catch((e) => setError(errText(e)));
  }, [code]);
  return (
    <Shell>
      <section className={`mx-auto mt-8 max-w-md text-center ${card}`}>
        <HouseLine size={40} aria-hidden="true" className="mx-auto text-brand" />
        {p ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold [text-wrap:balance]">Join “{p.name}”</h1>
            <p className="mt-2 text-base text-muted">
              {p.area} · ₹{p.budget.toLocaleString("en-IN")} per person · {p.members.length}/
              {p.size} in{p.moveIn ? ` · move in ${p.moveIn.slice(0, 10)}` : ""}
            </p>
            <p className="mt-2 text-sm">With {p.members.join(", ")}</p>
            {p.alreadyMember ? (
              <Link to="/squads/$id" params={{ id: p.id }} className={`mt-6 ${btnPrimary}`}>
                Open squad
              </Link>
            ) : !p.phoneVerified ? (
              <p className={`mt-6 text-sm ${inner}`}>
                Verify your phone first, then come back to this link.{" "}
                <Link to="/verification" className={linkCls}>
                  Verify phone
                </Link>
              </p>
            ) : p.members.length >= p.size ? (
              <p className={`mt-6 text-sm text-muted ${inner}`}>
                This squad is full. Ask the squad to share a new link if someone leaves.
              </p>
            ) : (
              <button
                type="button"
                disabled={busy}
                className={`mt-6 ${btnPrimary}`}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void joinSquad({ data: { code } })
                    .then((r) => navigate({ to: "/squads/$id", params: { id: r.id } }))
                    .catch((e) => setError(errText(e)))
                    .finally(() => setBusy(false));
                }}
              >
                Join squad
              </button>
            )}
          </>
        ) : !error ? (
          <div className="mt-4 space-y-2" aria-busy="true" aria-label="Loading invite">
            <div className={`${skeleton} mx-auto h-8 w-2/3`} />
            <div className={`${skeleton} mx-auto h-4 w-1/2`} />
          </div>
        ) : null}
        {error ? (
          <p className={`mt-4 ${errorBox}`} role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </Shell>
  );
}
