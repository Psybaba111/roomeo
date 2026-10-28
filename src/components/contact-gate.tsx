import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChatCircleDots, LockSimple } from "@phosphor-icons/react";
import { errText } from "@/lib/ui-text";
import { openConversation } from "@/lib/roomsetu/account-api";
import { getContactStatus, startContactCheckout } from "@/lib/roomsetu/squad-api";
import { UpiCheckout, type UpiCheckoutData } from "@/components/upi-checkout";
import { btnPrimary, card, errorBox, inner, skeleton } from "@/components/ui-tokens";

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
