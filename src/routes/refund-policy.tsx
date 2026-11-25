import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { LegalPage } from "@/components/legal-page";
import { refundPolicyFor, termsUpdated } from "@/lib/legal";
import { asFeeView, pricingCopy } from "@/lib/roomsetu/fee-copy";
import { getFeeView } from "@/lib/roomsetu/pricing-api";
import { TRIAL_CREDIT_WINDOW_DAYS, TRIAL_FEE_INR } from "@/lib/roomsetu/trial-nights";

const TRIAL = { feeInr: TRIAL_FEE_INR, windowDays: TRIAL_CREDIT_WINDOW_DAYS };

export const Route = createFileRoute("/refund-policy")({
  loader: () => getFeeView(),
  head: () => pageHead("Refund policy", { description: "When Roomeo refunds its fee, how the 7 day move out rule works, and where refunds go. Same rules as our Pricing and Terms.", path: "/refund-policy" }),
  component: RefundPolicy,
});

function RefundPolicy() {
  const fee = asFeeView(Route.useLoaderData());
  return (
    <LegalPage
      title="Refund policy"
      intro="When you get Roomeo's fee back, and when you don't. These are the same rules as our Pricing page and Terms of use."
      sections={refundPolicyFor(fee, pricingCopy(fee, TRIAL).faq)}
      updated={termsUpdated(fee)}
    />
  );
}
