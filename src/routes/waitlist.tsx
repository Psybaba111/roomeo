import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { Shell } from "@/components/shell";
import { WaitlistForm } from "@/components/waitlist-form";
import { getWaitlistMode } from "@/lib/roomsetu/waitlist-api";

/** "Launching soon" page that /search and listing pages send signed-out visitors to in waitlist mode. */
export const Route = createFileRoute("/waitlist")({
  beforeLoad: async () => {
    const { enabled } = await getWaitlistMode();
    if (!enabled) throw redirect({ to: "/" }); // flag off: this page doesn't exist
  },
  head: () => pageHead("Launching soon · Join the waitlist", { description: "Roomeo is launching soon. Join the waitlist for first pick of verified spare beds.", noindex: true }),
  component: WaitlistPage,
});

function WaitlistPage() {
  return (
    <Shell>
      <div className="mx-auto max-w-xl" data-testid="waitlist-page">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Launching soon 🚀</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">Beds aren't open yet. Your spot can be.</h1>
        <p className="mt-3 text-muted">We're verifying owners and beds before launch. Join the waitlist and we'll message you the moment beds open in your city.</p>
        <div className="mt-6">
          <WaitlistForm source="waitlist_page" />
        </div>
        <p className="mt-6 text-sm text-muted">
          Want your roomie type first?{" "}
          <Link to="/" className="font-semibold text-brand underline-offset-4 hover:underline">
            Play the 2-min game
          </Link>
          . Already have a deal with us?{" "}
          <Link to="/login" className="font-semibold text-brand underline-offset-4 hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>
    </Shell>
  );
}
