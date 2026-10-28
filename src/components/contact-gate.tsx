import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChatCircleDots, LockSimple, Ticket } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { startPassCheckout } from "@/lib/roomsetu/pricing-api";
import { errText } from "@/lib/ui-text";
import { openConversation } from "@/lib/roomsetu/account-api";
import { getContactStatus, startContactCheckout } from "@/lib/roomsetu/squad-api";
import { UpiCheckout, type UpiCheckoutData } from "@/components/upi-checkout";
import { btnPrimary, btnSecondary, card, errorBox, inner, skeleton } from "@/components/ui-tokens";

/** "Message the owner" with the one time contact fee in front of it. Hosts never pay. */
export function ContactGate({ listingId, isDemo }: { listingId: string; isDemo: boolean }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getContactStatus>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkout, setCheckout] = useState<UpiCheckoutData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function load() {
    void getContactStatus({ data: { listingId } })
      .then(setStatus)
      .catch((e) => setError(errText(e)))
      .finally(() => setLoading(false));
  }
  useEffect(load, [listingId]);

  if (loading)
    return (
      <div
        className={`${skeleton} h-12 w-full`}
        aria-busy="true"
        aria-label="Loading contact options"
      />
    );
  if (status?.isOwner) return null;
  if (status && status.model === "FREE_THEN_PASS" && !isDemo && !status.unlocked)
    return <PassGate listingId={listingId} status={status} reload={load} />;
  const free = isDemo || status?.unlocked;
  const fee = status?.fee ?? 499;
  return (
    <div data-testid="contact-gate">
      {error ? (
        <p className={`mb-2 ${errorBox}`} role="alert">
          {error}
        </p>
      ) : null}
      {free ? (
        <button
          type="button"
          disabled={busy}
          className={`w-full ${btnPrimary}`}
          onClick={() => {
            setBusy(true);
            setError("");
            void openConversation({ data: { listingId, roomWantedId: "", withUserId: "" } })
              .then((c) => navigate({ to: "/messages", search: { thread: c.id } }))
              .catch((e) => setError(errText(e)))
              .finally(() => setBusy(false));
          }}
        >
          <ChatCircleDots size={20} aria-hidden="true" /> Message inside roomeo
        </button>
      ) : (
        <section className={card} aria-labelledby="unlock-h">
          <p id="unlock-h" className="flex items-center gap-2 text-base font-semibold">
            <LockSimple size={18} aria-hidden="true" /> Unlock chat with the owner · ₹{fee} once
          </p>
          <p className="mt-2 text-sm text-muted [text-wrap:pretty]">
            Pay ₹{fee} once to roomeo by UPI to message this owner. It keeps spam and fake enquiries
            away, so owners actually reply. One payment unlocks this listing for good. Owners never
            pay. Squads pay once for everyone from the squad page.
          </p>
          <p className="mt-2 text-xs text-muted" data-testid="refund-rule">
            Refund rule: if the owner declines your request, the fee is refunded to your UPI ID. No
            refund once the owner has accepted, or if you withdraw.
          </p>
          {status?.refund ? (
            <p className={`mt-4 text-sm font-semibold ${inner}`} data-testid="refund-status">
              {status.refund.status === "REFUND_DUE"
                ? `The owner declined. Your ₹${fee} refund (${status.refund.ref}) is on its way to ${status.refund.vpa || "your UPI ID"}.`
                : `Refunded to ${status.refund.vpa || "your UPI ID"}. Refund UTR ${status.refund.utr}.`}
            </p>
          ) : null}
          {status?.pending?.status === "SUBMITTED" && !checkout ? (
            <p className={`mt-4 text-sm font-semibold ${inner}`}>
              Payment {status.pending.ref} received. Roomeo is confirming it and chat opens right
              after.
            </p>
          ) : null}
          {!checkout && status?.pending?.status !== "SUBMITTED" ? (
            <button
              type="button"
              disabled={busy || status?.upiReady === false}
              className={`mt-4 w-full ${btnPrimary}`}
              onClick={() => {
                setError("");
                setBusy(true);
                void startContactCheckout({ data: { listingId, squadId: "" } })
                  .then(setCheckout)
                  .catch((e) => setError(errText(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Pay ₹{fee} to unlock chat
            </button>
          ) : null}
          {checkout ? (
            <UpiCheckout
              data={checkout}
              onClose={() => {
                setCheckout(null);
                load();
              }}
            />
          ) : null}
        </section>
      )}
    </div>
  );
}

type Status = Awaited<ReturnType<typeof getContactStatus>>;

/** Pricing v2: free contacts first, then a weekly or monthly pass. */
function PassGate({ listingId, status, reload }: { listingId: string; status: Status; reload: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [checkout, setCheckout] = useState<UpiCheckoutData | null>(null);
  const s = status.summary;
  const open = s.access === "OPEN";
  const message = () => {
    setBusy("msg");
    setError("");
    void openConversation({ data: { listingId, roomWantedId: "", withUserId: "" } })
      .then((c) => navigate({ to: "/messages", search: { thread: c.id } }))
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(""));
  };
  const buy = (code: "WEEKLY" | "MONTHLY") => {
    setBusy(code);
    setError("");
    void startPassCheckout({ data: { code } })
      .then(setCheckout)
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(""));
  };
  return (
    <section className={card} aria-labelledby="contact-h" data-testid="contact-gate">
      {error ? (
        <p className={`mb-2 ${errorBox}`} role="alert">
          {error}
        </p>
      ) : null}
      {open ? (
        <>
          <p id="contact-h" className="text-base font-semibold" data-testid="contact-quota">
            {s.pass
              ? `Pass active until ${s.pass.endsAt.slice(0, 10)}. Message any owner.`
              : `${s.freeLeft} of ${s.freeTotal} free owner contacts left`}
          </p>
          <p className="mt-2 text-sm text-muted [text-wrap:pretty]">
            {s.pass
              ? "Unlimited contacts while your pass lasts."
              : "Messaging this owner uses one free contact. If the owner declines or does not reply in 48 hours, you get it back."}
          </p>
          <button type="button" disabled={busy !== ""} className={`mt-4 w-full ${btnPrimary}`} onClick={message} data-testid="message-owner">
            <ChatCircleDots size={20} aria-hidden="true" /> {busy === "msg" ? "Opening chat" : "Message the owner"}
          </button>
        </>
      ) : s.access === "NEED_PHONE" ? (
        <>
          <p id="contact-h" className="flex items-center gap-2 text-base font-semibold">
            <LockSimple size={18} aria-hidden="true" /> Verify your phone to message owners
          </p>
          <p className="mt-2 text-sm text-muted">You get {s.freeTotal} free owner contacts once your phone is verified.</p>
          <Link to="/verification" className={`mt-4 w-full ${btnPrimary}`}>
            Verify my phone
          </Link>
        </>
      ) : (
        <>
          <p id="contact-h" className="flex items-center gap-2 text-base font-semibold" data-testid="need-pass">
            <Ticket size={18} aria-hidden="true" /> You used your {s.freeTotal} free contacts
          </p>
          <p className="mt-2 text-sm text-muted [text-wrap:pretty]">
            Get a pass to message as many owners as you like. Browsing, saving and applying stay free.
          </p>
          <p className="mt-2 text-xs text-muted" data-testid="refund-rule">
            Refund promise: if every owner you contact with the pass declines or does not reply in 48 hours, you get the full pass price back.{" "}
            <Link to="/pricing" className="font-semibold text-brand underline-offset-4 hover:underline">
              How it works
            </Link>
          </p>
          {status.pendingPass?.status === "SUBMITTED" && !checkout ? (
            <p className={`mt-4 text-sm font-semibold ${inner}`} data-testid="pass-pending">
              Payment {status.pendingPass.ref} received. Roomeo is confirming it and your pass starts right after.
            </p>
          ) : null}
          {!checkout && status.pendingPass?.status !== "SUBMITTED" && status.passes.enabled ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={busy !== "" || !status.upiReady} className={btnPrimary} onClick={() => buy("WEEKLY")} data-testid="buy-weekly">
                Weekly pass ₹{status.passes.weekly}
              </button>
              <button type="button" disabled={busy !== "" || !status.upiReady} className={btnSecondary} onClick={() => buy("MONTHLY")} data-testid="buy-monthly">
                Monthly pass ₹{status.passes.monthly}
              </button>
            </div>
          ) : null}
          {checkout ? (
            <UpiCheckout
              data={checkout}
              onClose={() => {
                setCheckout(null);
                reload();
              }}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
