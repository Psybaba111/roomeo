import { pageHead, SITE_URL } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { NeedAccount } from "@/components/need-account";
import { errText } from "@/lib/ui-text";
import { whatsappShareUrl } from "@/lib/roomsetu/contact";
import {
  getSquad,
  leaveSquad,
  sendJointRequest,
  shortlistListing,
  startContactCheckout,
  voteListing,
} from "@/lib/roomsetu/squad-api";
import { UpiCheckout, type UpiCheckoutData } from "@/components/upi-checkout";

export const Route = createFileRoute("/squads/$id")({
  head: () => pageHead("Your squad", { noindex: true }),
  component: () => (
    <NeedAccount next="/squads">
      <Squad />
    </NeedAccount>
  ),
});

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const REQ: Record<string, string> = {
  PENDING: "Request sent · waiting for owner",
  ACCEPTED: "Owner accepted 🎉",
  DECLINED: "Owner declined",
  VISIT_PROPOSED: "Owner proposed a visit",
  PAUSED: "Paused · squad changed, everyone must vote again",
};

function Squad() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [s, setS] = useState<Awaited<ReturnType<typeof getSquad>> | null>(null);
  const [error, setError] = useState("");
  const [checkout, setCheckout] = useState<{ listingId: string; data: UpiCheckoutData } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  function load() {
    void getSquad({ data: { squadId: id } })
      .then(setS)
      .catch((e) => setError(errText(e)));
  }
  useEffect(load, [id]);
  const run = (p: Promise<unknown>) => void p.then(load).catch((e) => setError(errText(e)));
  if (!s)
    return (
      <Shell>
        {error ? <p className="text-danger">{error}</p> : <p className="text-muted">Loading…</p>}
      </Shell>
    );
  const invite = `${typeof window !== "undefined" ? window.location.origin : SITE_URL}/squads/join/${s.inviteCode}`;
  const shareText = `Join my roomeo squad "${s.name}" — we're renting a whole flat in ${s.area}, ${inr(s.budget)}/person. ${invite}`;
  const open = s.size - s.members.length;
  return (
    <Shell>
      <Link to="/squads" className="text-sm text-muted">
        ← Squads
      </Link>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">{s.name}</h1>
      <p className="mt-1 text-muted">
        {s.area} · {inr(s.budget)}/person · combined {inr(s.budget * s.members.length)}/mo{" "}
        {s.moveIn ? `· move-in ${s.moveIn}` : ""}
      </p>
      {error ? (
        <p className="mt-3 text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-6 rounded-3xl border border-line bg-card p-4">
        <h2 className="font-semibold">
          Members {s.members.length}/{s.size}
        </h2>
        <ul className="mt-2 space-y-1 text-sm" data-testid="squad-members">
          {s.members.map((m) => (
            <li key={m.id}>
              {m.name}
              {m.id === s.me ? " (you)" : ""} · {m.phoneVerified ? "phone ✓" : "phone ✗"} ·{" "}
              {m.idVerified ? "ID ✓" : "ID not verified"}
            </li>
          ))}
          {Array.from({ length: open }, (_, i) => (
            <li key={`o${i}`} className="text-muted">
              Open spot
            </li>
          ))}
        </ul>
        {open > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={whatsappShareUrl(shareText)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-full bg-[#25D366] px-4 text-sm font-semibold text-[#062]"
            >
              Invite on WhatsApp
            </a>
            <button
              type="button"
              className="h-10 rounded-full border border-line px-4 text-sm font-semibold"
              onClick={() =>
                void navigator.clipboard?.writeText(invite).then(() => setCopied(true))
              }
            >
              {copied ? "Copied!" : "Copy invite link"}
            </button>
            <code className="w-full break-all text-xs text-muted" data-testid="invite-link">
              {invite}
            </code>
          </div>
        ) : (
          <p className="mt-2 text-sm font-semibold text-pop">Squad is full. Vote on flats below.</p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-2xl font-semibold">Shortlist</h2>
        <p className="text-sm text-muted">
          Add flats from any listing page (“Add to squad shortlist”). When the squad is full and
          everyone votes yes, send the owner one joint request.
        </p>
        {s.shortlist.length === 0 ? (
          <p className="mt-3 rounded-3xl border border-dashed border-line p-5 text-center text-muted">
            Nothing shortlisted yet.{" "}
            <Link
              to="/search"
              search={{
                city: "",
                locality: "",
                maxRent: "",
                roomType: "",
                furnished: "",
                gender: "",
                food: "",
                sort: "recommended",
                q: "",
                availableBy: "",
              }}
              className="font-semibold text-brand"
            >
              Browse flats →
            </Link>
          </p>
        ) : null}
        <ul className="mt-3 space-y-3">
          {s.shortlist.map((f) => {
            const mine = f.votes[s.me];
            return (
              <li
                key={f.listingId}
                className="rounded-3xl border border-line bg-card p-4"
                data-testid="shortlist-item"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      to="/listing/$id"
                      params={{ id: f.listingId }}
                      className="font-semibold hover:text-brand"
                    >
                      {f.title}
                    </Link>
                    <p className="text-sm text-muted">
                      {f.locality} · {inr(f.rent)}/mo{" "}
                      {f.kind === "ENTIRE_FLAT"
                        ? `· entire flat · ${f.bedrooms}BR`
                        : "· single bed"}
                    </p>
                  </div>
                  {f.requestStatus ? (
                    <span
                      className="rounded-full bg-paper px-3 py-1 text-xs font-semibold"
                      data-testid="request-status"
                    >
                      {REQ[f.requestStatus] ?? f.requestStatus}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  {s.members.map((m) => (
                    <span key={m.id} className="rounded-full border border-line px-2 py-0.5">
                      {m.name.split(" ")[0]}:{" "}
                      {f.votes[m.id] === true ? "👍" : f.votes[m.id] === false ? "👎" : "…"}
                    </span>
                  ))}
                </div>
                {f.ownerNote ? <p className="mt-2 text-sm">Owner: {f.ownerNote}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`h-10 rounded-full px-4 text-sm font-semibold ${mine === true ? "bg-pop text-card" : "border border-line"}`}
                    onClick={() =>
                      run(voteListing({ data: { squadId: id, listingId: f.listingId, yes: true } }))
                    }
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className={`h-10 rounded-full px-4 text-sm font-semibold ${mine === false ? "bg-danger text-card" : "border border-line"}`}
                    onClick={() =>
                      run(
                        voteListing({ data: { squadId: id, listingId: f.listingId, yes: false } }),
                      )
                    }
                  >
                    No
                  </button>
                  {!f.requestStatus || f.requestStatus === "PAUSED" ? (
                    <button
                      type="button"
                      disabled={!f.allYes}
                      className="h-10 rounded-full bg-brand px-4 text-sm font-semibold text-card disabled:opacity-40"
                      onClick={() =>
                        run(sendJointRequest({ data: { squadId: id, listingId: f.listingId } }))
                      }
                    >
                      {f.requestStatus === "PAUSED" ? "Resend joint request" : "Send joint request"}
                    </button>
                  ) : null}
                  {!f.requestStatus ? (
                    <button
                      type="button"
                      className="h-10 rounded-full px-3 text-sm text-muted underline"
                      onClick={() =>
                        run(
                          shortlistListing({
                            data: { squadId: id, listingId: f.listingId, remove: true },
                          }),
                        )
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                {f.requestStatus && f.requestStatus !== "DECLINED" ? (
                  <div className="mt-3 rounded-2xl bg-paper p-3 text-sm">
                    {f.unlocked && f.threadId ? (
                      <Link
                        to="/messages"
                        search={{ thread: f.threadId }}
                        className="font-semibold text-brand"
                        data-testid="squad-chat-link"
                      >
                        Open squad chat with the owner →
                      </Link>
                    ) : f.payStatus === "SUBMITTED" ? (
                      <p>
                        Contact fee paid. Roomeo is confirming it; the squad chat opens right after.
                      </p>
                    ) : (
                      <>
                        <p>
                          <b>Unlock squad chat · {inr(s.fee)} once.</b> One member pays roomeo by
                          UPI and the whole squad can chat with this owner. The owner never pays.
                          (Splitting the fee between members is coming soon.)
                        </p>
                        {checkout?.listingId === f.listingId ? (
                          <UpiCheckout
                            data={checkout.data}
                            onClose={() => {
                              setCheckout(null);
                              load();
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="mt-2 h-10 rounded-full bg-ink px-4 font-semibold text-card"
                            onClick={() =>
                              void startContactCheckout({
                                data: { listingId: f.listingId, squadId: id },
                              })
                                .then((d) => setCheckout({ listingId: f.listingId, data: d }))
                                .catch((e) => setError(errText(e)))
                            }
                          >
                            Pay {inr(s.fee)} for the squad
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <button
        type="button"
        className="mt-8 h-10 rounded-full border border-danger px-4 text-sm font-semibold text-danger"
        onClick={() => {
          if (
            window.confirm(
              "Leave this squad? Your spot opens up and any request to an owner is paused.",
            )
          )
            void leaveSquad({ data: { squadId: id } })
              .then(() => navigate({ to: "/squads" }))
              .catch((e) => setError(errText(e)));
        }}
      >
        Leave squad
      </button>
    </Shell>
  );
}
