import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { errText } from "@/lib/ui-text";
import { openConversation } from "@/lib/roomsetu/account-api";
import { getContactStatus, startContactCheckout } from "@/lib/roomsetu/squad-api";
import { UpiCheckout, type UpiCheckoutData } from "@/components/upi-checkout";

/** "Message the owner" with the one-time contact fee in front of it. Hosts never pay. */
export function ContactGate({ listingId, isDemo }: { listingId: string; isDemo: boolean }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getContactStatus>> | null>(null);
  const [checkout, setCheckout] = useState<UpiCheckoutData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getContactStatus({ data: { listingId } })
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [listingId]);

  async function openChat() {
    const convo = await openConversation({ data: { listingId, roomWantedId: "", withUserId: "" } });
    await navigate({ to: "/messages", search: { thread: convo.id } });
  }
  if (status?.isOwner) return null;
  const free = isDemo || status?.unlocked;
  const fee = status?.fee ?? 499;
  return (
    <div data-testid="contact-gate">
      {error ? (
        <p className="mb-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {free ? (
        <button
          type="button"
          disabled={busy}
          className="h-12 w-full rounded-full bg-brand font-semibold text-card"
          onClick={() => {
            setBusy(true);
            void openChat()
              .catch((e) => setError(errText(e)))
              .finally(() => setBusy(false));
          }}
        >
          Message inside roomeo
        </button>
      ) : (
        <div className="rounded-3xl border border-line bg-card p-4">
          <p className="font-semibold">Unlock chat with the owner · ₹{fee} once</p>
          <p className="mt-1 text-sm text-muted">
            Pay ₹{fee} once to roomeo by UPI to message this owner. It keeps spam and fake enquiries
            away so owners actually reply. One payment unlocks this listing for good. Owners never
            pay. Squads: one person pays for the whole squad from the squad page.
          </p>
          {status?.pending?.status === "SUBMITTED" && !checkout ? (
            <p className="mt-3 rounded-2xl bg-marigold-soft p-3 text-sm font-semibold">
              Payment {status.pending.ref} received. Roomeo is confirming it; chat opens right
              after.
            </p>
          ) : null}
          {!checkout && status?.pending?.status !== "SUBMITTED" ? (
            <button
              type="button"
              disabled={busy || status?.upiReady === false}
              className="mt-3 h-12 w-full rounded-full bg-brand font-semibold text-card disabled:opacity-50"
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
                void getContactStatus({ data: { listingId } }).then(setStatus);
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
