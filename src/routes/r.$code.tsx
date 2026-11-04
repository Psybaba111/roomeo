import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { REF_STORAGE_KEY } from "@/components/referral-card";
import { normalizeCode } from "@/lib/roomsetu/referrals";
import { getInviteStatus } from "@/lib/roomsetu/referral-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/r/$code")({
  head: () =>
    pageHead("You're invited to roomeo", {
      description: "Find a verified shared room or PG bed. Chat free, ₹499 + GST (₹589) once when you lock a bed, not a broker's month.",
      noindex: true,
    }),
  component: Invite,
});

function Invite() {
  const { code } = Route.useParams();
  const valid = normalizeCode(code);
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  const [offer, setOffer] = useState<number | null>(null);
  useEffect(() => {
    // Only real codes with the referral program switched on show a ₹ offer (2 Nov 2026).
    void getInviteStatus({ data: code }).then((s) => setOffer(s.live ? s.perPerson : null)).catch(() => setOffer(null));
  }, [code]);
  useEffect(() => {
    if (valid) localStorage.setItem(REF_STORAGE_KEY, valid);
    if (valid && user) void navigate({ to: "/activity" });
  }, [valid, user, navigate]);
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">You got invited 💌</p>
      <h1 className="mt-2 font-display text-5xl" data-testid="invite-h1">{offer ? `₹${offer} off your first month` : "A friend invited you to roomeo"}</h1>
      <p className="mt-3 max-w-md text-muted">
        {offer
          ? `Make an account, find your bed, move in. You and your friend both get ₹${offer} off. Zero broker fees, always.`
          : valid
            ? "Make an account, find your bed, move in. Chat free; you pay ₹499 + GST (₹589) once when you lock a bed. Zero broker fees."
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
