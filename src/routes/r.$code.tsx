import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { REF_STORAGE_KEY } from "@/components/referral-card";
import { normalizeCode } from "@/lib/roomsetu/referrals";
import { getInviteStatus } from "@/lib/roomsetu/referral-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { pageHead } from "@/lib/seo";
import { asFeeView, inviteBody, inviteDescription } from "@/lib/roomsetu/fee-copy";
import { getFeeView } from "@/lib/roomsetu/pricing-api";

export const Route = createFileRoute("/r/$code")({
  loader: () => getFeeView(),
  head: ({ loaderData }) =>
    pageHead("You're invited to roomeo", {
      description: inviteDescription(asFeeView(loaderData)),
      noindex: true,
    }),
  component: Invite,
});

function Invite() {
  const { code } = Route.useParams();
  const fee = asFeeView(Route.useLoaderData());
  const valid = normalizeCode(code);
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  const [offer, setOffer] = useState<number | null>(null);
  const [feeMode, setFeeMode] = useState(false);
  useEffect(() => {
    // Only real codes with the referral program switched on show a ₹ offer (2 Nov 2026).
    void getInviteStatus({ data: code }).then((s) => { setOffer(s.live ? s.perPerson : null); setFeeMode(s.live && s.mode === "fee"); }).catch(() => setOffer(null));
  }, [code]);
  useEffect(() => {
    if (valid) localStorage.setItem(REF_STORAGE_KEY, valid);
    if (valid && user) void navigate({ to: "/dashboard" });
  }, [valid, user, navigate]);
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">You got invited 💌</p>
      <h1 className="mt-2 font-display text-5xl" data-testid="invite-h1">{offer ? (feeMode ? `₹${offer} Roomeo credit for you both` : `₹${offer} off your first month`) : "A friend invited you to roomeo"}</h1>
      <p className="mt-3 max-w-md text-muted">
        {offer && !feeMode
          ? `Make an account, find your bed, move in. You and your friend both get ₹${offer} off. Zero broker fees, always.`
          : offer
          ? `Make an account, find your bed, move in. Once you've paid your first month, you and your friend each get ₹${offer} off your next Roomeo fee (credit, not cash). Zero broker fees, always.`
          : valid
            ? inviteBody(fee)
            : "This invite link looks off. You can still sign up, it's free."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/register" className="inline-flex h-12 items-center rounded-lg bg-ink px-5 font-semibold text-card shadow-[0_4px_0_var(--color-brand)]">
          Sign up free →
        </Link>
        <Link to="/" className="inline-flex h-12 items-center rounded-lg border border-line px-5 font-semibold">
          Browse beds first
        </Link>
      </div>
    </Shell>
  );
}
