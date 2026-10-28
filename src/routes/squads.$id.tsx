import { pageHead, SITE_URL } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle,
  Copy,
  ThumbsDown,
  ThumbsUp,
  UserPlus,
  WhatsappLogo,
} from "@phosphor-icons/react";
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
import {
  btnDanger,
  btnDark,
  btnSmall,
  btnSmallPrimary,
  card,
  errorBox,
  inner,
  linkCls,
  skeleton,
} from "@/components/ui-tokens";

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
  PENDING: "Request sent, waiting for the owner",
  ACCEPTED: "Owner accepted",
  DECLINED: "Owner declined",
  VISIT_PROPOSED: "Owner proposed a visit",
  PAUSED: "Paused, the squad changed so everyone votes again",
};

function SquadSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading squad">
      <div className={`${skeleton} h-10 w-2/3`} />
      <div className={`${skeleton} h-24 w-full`} />
      <div className={`${skeleton} h-40 w-full`} />
    </div>
  );
}

function Squad() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [s, setS] = useState<Awaited<ReturnType<typeof getSquad>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [checkout, setCheckout] = useState<{ listingId: string; data: UpiCheckoutData } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  function load() {
    void getSquad({ data: { squadId: id } })
      .then(setS)
      .catch((e) => setError(errText(e)));
  }
  useEffect(load, [id]);
  const run = (key: string, p: () => Promise<unknown>) => {
    setError("");
    setBusy(key);
    void p()
      .then(load)
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(""));
  };
  if (!s)
    return (
      <Shell>
        <section className="mt-8">
          {error ? (
            <p className={errorBox} role="alert">
              {error}
            </p>
          ) : (
            <SquadSkeleton />
          )}
        </section>
      </Shell>
    );
  const invite = `${typeof window !== "undefined" ? window.location.origin : SITE_URL}/squads/join/${s.inviteCode}`;
  const shareText = `Join my roomeo squad "${s.name}". We are renting a whole flat in ${s.area} at ${inr(s.budget)} per person. ${invite}`;
  const open = s.size - s.members.length;
  return (
    <Shell>
      <nav aria-label="Breadcrumb" className="mt-4">
        <Link to="/squads" className={linkCls}>
          Back to squads
        </Link>
      </nav>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight [text-wrap:balance]">{s.name}</h1>
      <p className="mt-2 text-base text-muted [text-wrap:pretty]">
        {s.area} · {inr(s.budget)} per person · {inr(s.budget * s.members.length)} combined each
        month{s.moveIn ? ` · move in ${s.moveIn}` : ""}
      </p>
      {error ? (
        <p className={`mt-4 ${errorBox}`} role="alert">
          {error}
        </p>
      ) : null}

      <section className={`mt-6 ${card}`} aria-labelledby="members-h">
        <h2 id="members-h" className="text-lg font-semibold">
          Members {s.members.length}/{s.size}
        </h2>
        <ul className="mt-2 space-y-2 text-sm" data-testid="squad-members">
          {s.members.map((m) => (
            <li key={m.id} className={inner}>
              <span className="font-semibold">
                {m.name}
                {m.id === s.me ? " (you)" : ""}
              </span>{" "}
              · {m.phoneVerified ? "phone verified" : "phone not verified"} ·{" "}
              {m.idVerified ? "ID verified" : "ID not verified"}
            </li>
          ))}
          {Array.from({ length: open }, (_, i) => (
            <li key={`o${i}`} className={`${inner} flex items-center gap-2 text-muted`}>
              <UserPlus size={16} aria-hidden="true" /> Open spot
            </li>
          ))}
        </ul>
        {open > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={whatsappShareUrl(shareText)}
              target="_blank"
              rel="noreferrer"
              className={btnSmall}
            >
              <WhatsappLogo size={18} weight="fill" aria-hidden="true" /> Invite on WhatsApp
            </a>
            <button
              type="button"
              className={btnSmall}
              onClick={() =>
                void navigator.clipboard?.writeText(invite).then(() => setCopied(true))
              }
            >
              <Copy size={16} aria-hidden="true" /> {copied ? "Link copied" : "Copy invite link"}
            </button>
            <code className="w-full break-all text-xs text-muted" data-testid="invite-link">
              {invite}
            </code>
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-pop">
            <CheckCircle size={18} weight="fill" aria-hidden="true" /> Squad is full. Vote on flats
            below.
          </p>
        )}
      </section>

      <section className="mt-8" aria-labelledby="shortlist-h">
        <h2 id="shortlist-h" className="text-2xl font-semibold">
          Shortlist
        </h2>
        <p className="mt-2 text-sm text-muted [text-wrap:pretty]">
          Add flats from any listing page with “Add to squad shortlist”. When the squad is full and
          everyone votes yes, send the owner one joint request.
        </p>
        {s.shortlist.length === 0 ? (
          <div className={`mt-4 ${card} text-center`}>
            <p className="text-base font-semibold">Nothing shortlisted yet</p>
            <p className="mt-2 text-sm text-muted">
              Find an entire flat that fits {s.size} people and add it here.
            </p>
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
              className={`mt-4 ${btnSmallPrimary}`}
            >
              Browse flats
            </Link>
          </div>
        ) : null}
        <ul className="mt-4 space-y-4">
          {s.shortlist.map((f) => {
            const mine = f.votes[s.me];
            const k = f.listingId;
            return (
              <li key={k} className={card} data-testid="shortlist-item">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      to="/listing/$id"
                      params={{ id: k }}
                      className={`text-base ${linkCls} text-ink`}
                    >
                      {f.title}
                    </Link>
                    <p className="text-sm text-muted">
                      {f.locality} · {inr(f.rent)} a month ·{" "}
                      {f.kind === "ENTIRE_FLAT"
                        ? `entire flat, ${f.bedrooms} bedrooms`
                        : "single bed"}
                    </p>
                  </div>
                  {f.requestStatus ? (
                    <span
                      className="rounded-full border border-line px-3 py-1 text-xs font-semibold"
                      data-testid="request-status"
                    >
                      {REQ[f.requestStatus] ?? f.requestStatus}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  {s.members.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1"
                    >
                      {m.name.split(" ")[0]}:{" "}
                      {f.votes[m.id] === true ? (
                        <ThumbsUp size={14} weight="fill" aria-label="yes" />
                      ) : f.votes[m.id] === false ? (
                        <ThumbsDown size={14} weight="fill" aria-label="no" />
                      ) : (
                        <span aria-label="not voted">waiting</span>
                      )}
                    </span>
                  ))}
                </div>
                {f.ownerNote ? (
                  <p className={`mt-2 text-sm ${inner}`}>Owner says: {f.ownerNote}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={mine === true}
                    disabled={busy === k}
                    className={mine === true ? btnSmallPrimary : btnSmall}
                    onClick={() =>
                      run(k, () => voteListing({ data: { squadId: id, listingId: k, yes: true } }))
                    }
                  >
                    <ThumbsUp size={16} aria-hidden="true" /> Yes
                  </button>
                  <button
                    type="button"
                    aria-pressed={mine === false}
                    disabled={busy === k}
                    className={mine === false ? btnDanger : btnSmall}
                    onClick={() =>
                      run(k, () => voteListing({ data: { squadId: id, listingId: k, yes: false } }))
                    }
                  >
                    <ThumbsDown size={16} aria-hidden="true" /> No
                  </button>
                  {!f.requestStatus || f.requestStatus === "PAUSED" ? (
                    <button
                      type="button"
                      disabled={!f.allYes || busy === k}
                      title={f.allYes ? "" : "Everyone in a full squad has to vote yes"}
                      className={btnSmallPrimary}
                      onClick={() =>
                        run(k, () => sendJointRequest({ data: { squadId: id, listingId: k } }))
                      }
                    >
                      {f.requestStatus === "PAUSED" ? "Resend joint request" : "Send joint request"}
                    </button>
                  ) : null}
                  {!f.requestStatus ? (
                    <button
                      type="button"
                      disabled={busy === k}
                      className={btnSmall}
                      onClick={() =>
                        run(k, () =>
                          shortlistListing({ data: { squadId: id, listingId: k, remove: true } }),
                        )
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                {f.refund ? (
                  <p className={`mt-4 text-sm font-semibold ${inner}`} data-testid="refund-status">
                    {f.refund.startsWith("REFUND_DUE")
                      ? `Owner declined. The ${inr(s.fee)} contact fee is being refunded to ${f.refund.split("|")[2] || "the payer's UPI ID"}.`
                      : `Refunded to ${f.refund.split("|")[2] || "the payer"}. Refund UTR ${f.refund.split("|")[1]}.`}
                  </p>
                ) : null}
                {f.requestStatus && f.requestStatus !== "DECLINED" ? (
                  <div className={`mt-4 text-sm ${inner}`}>
                    {f.unlocked && f.threadId ? (
                      <Link
                        to="/messages"
                        search={{ thread: f.threadId }}
                        className={linkCls}
                        data-testid="squad-chat-link"
                      >
                        Open squad chat with the owner
                      </Link>
                    ) : f.payStatus === "SUBMITTED" ? (
                      <p>
                        Contact fee paid. Roomeo is confirming it and the squad chat opens right
                        after.
                      </p>
                    ) : (
                      <>
                        <p className="[text-wrap:pretty]">
                          <b>Unlock squad chat for {inr(s.fee)} once.</b> One member pays roomeo by
                          UPI and the whole squad can chat with this owner. The owner never pays.
                          Splitting the fee between members is coming soon.
                        </p>
                        <p className="mt-2 text-xs text-muted">
                          Refund rule: if the owner declines, the fee goes back to the payer's UPI
                          ID. No refund once the owner has accepted, or if someone leaves.
                        </p>
                        {checkout?.listingId === k ? (
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
                            disabled={busy === `pay${k}`}
                            className={`mt-2 ${btnDark}`}
                            onClick={() => {
                              setError("");
                              setBusy(`pay${k}`);
                              void startContactCheckout({ data: { listingId: k, squadId: id } })
                                .then((d) => setCheckout({ listingId: k, data: d }))
                                .catch((e) => setError(errText(e)))
                                .finally(() => setBusy(""));
                            }}
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

      <section className={`mt-8 ${card}`} aria-labelledby="leave-h">
        <h2 id="leave-h" className="text-base font-semibold">
          Leave this squad
        </h2>
        <p className="mt-2 text-sm text-muted">
          Your spot opens up again and any request to an owner is paused until the squad is full and
          votes again. A paid contact fee is not refunded when someone leaves.
        </p>
        {confirmLeave ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={btnDanger}
              disabled={busy === "leave"}
              onClick={() => {
                setBusy("leave");
                void leaveSquad({ data: { squadId: id } })
                  .then(() => navigate({ to: "/squads" }))
                  .catch((e) => setError(errText(e)))
                  .finally(() => setBusy(""));
              }}
            >
              Yes, leave the squad
            </button>
            <button type="button" className={btnSmall} onClick={() => setConfirmLeave(false)}>
              Stay
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`mt-4 ${btnDanger}`}
            onClick={() => setConfirmLeave(true)}
          >
            Leave squad
          </button>
        )}
      </section>
    </Shell>
  );
}
