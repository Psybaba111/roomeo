import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { REF_STORAGE_KEY } from "@/components/referral-card";
import { normalizeCode, REFERRAL_CREDIT_INR } from "@/lib/roomsetu/referrals";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/r/$code")({
  head: () =>
    pageHead(`Your friend saved you ₹${REFERRAL_CREDIT_INR}`, {
      description: `Join roomeo with this invite and you both get ₹${REFERRAL_CREDIT_INR} off your first month. Free for renters, no broker's month.`,
      noindex: true,
    }),
  component: Invite,
});

function Invite() {
  const { code } = Route.useParams();
  const valid = normalizeCode(code);
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  useEffect(() => {
    if (valid) localStorage.setItem(REF_STORAGE_KEY, valid);
    if (valid && user) void navigate({ to: "/dashboard" });
  }, [valid, user, navigate]);
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">You got invited 💌</p>
      <h1 className="mt-2 font-display text-5xl">₹{REFERRAL_CREDIT_INR} off your first month</h1>
      <p className="mt-3 max-w-md text-muted">
        {valid
          ? `Make an account, find your bed, move in. You and your friend both get ₹${REFERRAL_CREDIT_INR} off. Zero broker fees, always.`
          : "This invite link looks off. You can still sign up, it's free."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/register" className="inline-flex h-12 items-center rounded-lg bg-ink px-5 font-semibold text-card shadow-[0_4px_0_var(--color-brand)]">
          Claim it, sign up free →
        </Link>
        <Link to="/" className="inline-flex h-12 items-center rounded-lg border border-line px-5 font-semibold">
          Browse beds first
        </Link>
      </div>
    </Shell>
  );
}
