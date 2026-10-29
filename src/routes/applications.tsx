import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { listApplications, openConversation, setApplication } from "@/lib/roomsetu/account-api";
import { agreeRent, confirmRentPayment, startRentPayment } from "@/lib/roomsetu/trust-api";
import { inr } from "@/lib/roomsetu/map";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { confirmMoveIn, myMoveIns } from "@/lib/roomsetu/pricing-api";
import { DealAgreement } from "@/components/deal-agreement";
import { btnSmallPrimary, errorBox, inner } from "@/components/ui-tokens";

type MoveInfo = Awaited<ReturnType<typeof myMoveIns>>;

/** Both sides confirm the move in. The success fee (off at launch) shows only after both confirm. */
function MoveIn({ applicationId, mine, info, reload }: { applicationId: string; mine: boolean; info: MoveInfo | null; reload: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const m = info?.items.find((i) => i.applicationId === applicationId);
  const meDone = mine ? m?.seekerConfirmed : m?.ownerConfirmed;
  return (
    <div className={`mt-4 text-sm ${inner}`} data-testid="move-in">
      {m?.confirmed ? (
        <p className="font-semibold" data-testid="move-in-confirmed">Move in confirmed by both of you.</p>
      ) : meDone ? (
        <p>You confirmed. Waiting for the {mine ? "owner" : "tenant"} to confirm.</p>
      ) : (
        <button
          type="button"
          disabled={busy}
          className={btnSmallPrimary}
          data-testid="confirm-move-in"
          onClick={() => {
            setBusy(true);
            setError("");
            void confirmMoveIn({ data: { applicationId } }).then(reload).catch((e) => setError(errText(e))).finally(() => setBusy(false));
          }}
        >
          Confirm move in
        </button>
      )}
      {error ? <p className={`mt-2 ${errorBox}`} role="alert">{error}</p> : null}
    </div>
  );
}

export const Route = createFileRoute("/applications")({
  head: () => pageHead("Room requests", { noindex: true }),
  component: () => (
    <NeedAccount next="/applications">
      <Apps />
    </NeedAccount>
  ),
});

type Checkout = { keyId: string; orderId: string; amount: number };

function openCheckout(data: Checkout, onPaid: (response: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string }) => void) {
  const start = () => {
    const RazorpayCtor = (window as unknown as { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } }).Razorpay;
    if (!RazorpayCtor) return;
    new RazorpayCtor({
      key: data.keyId,
      amount: data.amount,
      currency: "INR",
      name: "roomeo.com",
      description: "Your bed",
      order_id: data.orderId,
      handler: onPaid,
    }).open();
  };
  if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
    start();
    return;
  }
  const script = document.createElement("script");
  script.src = "https://checkout.razorpay.com/v1/checkout.js";
  script.onload = start;
  document.body.appendChild(script);
}

function Apps() {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listApplications>>>([]);
  const [error, setError] = useState("");
  const [moves, setMoves] = useState<MoveInfo | null>(null);
  function loadMoves() {
    void myMoveIns().then(setMoves).catch(() => undefined);
  }
  function load() {
    void listApplications().then(setRows).catch((e) => setError(errText(e)));
    loadMoves();
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  return (
    <Shell>
      <h1 className="text-4xl font-semibold tracking-tight">Room requests</h1>
      <p className="mt-2 text-muted [text-wrap:pretty]">Requests are free. Once the owner accepts and you move in, both of you tap Confirm move in.</p>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      <ul className="mt-6 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-3xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link to="/listing/$id" params={{ id: row.listingId }} className="font-semibold">{row.title}</Link>
                <p className="text-sm text-muted">{row.city} · {inr(row.rent)} rent · {inr(row.deposit)} deposit · {row.createdOn}</p>
                <p className="mt-2 text-sm">{row.note}</p>
                <p className="mt-1 text-sm">{row.mine ? "You asked" : row.seekerName} · {row.status}</p>
                {row.status === "ACCEPTED" && !row.demo ? (
                  <p className="mt-2 text-sm">
                    Rent {inr(row.rent)} a month and {inr(row.deposit)} deposit, paid to the owner. Roomeo takes no cut of the rent.
                    {" "}{row.seekerAgreed ? "Seeker agreed." : "Seeker has not agreed."} {row.hostAgreed ? "Host agreed." : "Host has not agreed."}
                    {row.agreement === "PAID" ? " Paid." : ""}
                  </p>
                ) : null}
                {row.status === "ACCEPTED" && !row.demo ? (
                  <>
                    <DealAgreement applicationId={row.id} />
                    <MoveIn applicationId={row.id} mine={row.mine} info={moves} reload={loadMoves} />
                  </>
                ) : null}
                {row.demo ? <p className="mt-2 text-sm text-muted">Sample room. Rent is not collected here.</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {row.mine && row.status === "PENDING" ? (
                  <button type="button" className="h-10 rounded-full border border-line px-3 text-sm" onClick={() => void setApplication({ data: { id: row.id, status: "WITHDRAWN" } }).then(load)}>Withdraw</button>
                ) : null}
                {!row.mine && row.status === "PENDING" ? (
                  <>
                    <button type="button" className="h-10 rounded-full bg-brand px-3 text-sm text-card" onClick={() => void setApplication({ data: { id: row.id, status: "ACCEPTED" } }).then(load)}>Accept</button>
                    <button type="button" className="h-10 rounded-full border border-line px-3 text-sm" onClick={() => void setApplication({ data: { id: row.id, status: "DECLINED" } }).then(load)}>Decline</button>
                  </>
                ) : null}
                {row.status === "ACCEPTED" && !row.demo && row.agreement !== "PAID" && ((row.mine && !row.seekerAgreed) || (!row.mine && !row.hostAgreed)) ? (
                  <button type="button" className="h-10 rounded-full bg-brand px-3 text-sm text-card" onClick={() => void agreeRent({ data: row.id }).then(load).catch((e) => setError(errText(e)))}>Agree this rent</button>
                ) : null}
                {row.mine && row.status === "ACCEPTED" && !row.demo && row.seekerAgreed && row.hostAgreed && row.agreement !== "PAID" ? (
                  <button
                    type="button"
                    className="h-10 rounded-full bg-ink px-3 text-sm font-semibold text-card"
                    onClick={() => {
                      setError("");
                      void startRentPayment({ data: row.id })
                        .then((order) => {
                          openCheckout(order, (response) => {
                            void confirmRentPayment({
                              data: {
                                orderId: response.razorpay_order_id ?? order.orderId,
                                paymentId: response.razorpay_payment_id ?? "",
                                signature: response.razorpay_signature ?? "",
                              },
                            })
                              .then(load)
                              .catch((e) => setError(errText(e)));
                          });
                        })
                        .catch((e) => setError(errText(e)));
                    }}
                  >
                    Pay rent
                  </button>
                ) : null}
                {!row.mine ? (
                  <button
                    type="button"
                    className="h-10 rounded-full border border-line px-3 text-sm"
                    onClick={() => {
                      void openConversation({ data: { listingId: row.listingId, roomWantedId: "", withUserId: row.seekerId } })
                        .then((convo) => navigate({ to: "/messages", search: { thread: convo.id } }))
                        .catch((e) => setError(errText(e)));
                    }}
                  >
                    Message
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="mt-4 text-muted">No requests yet.</p> : null}
    </Shell>
  );
}
