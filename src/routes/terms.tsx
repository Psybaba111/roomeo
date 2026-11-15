import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { LegalPage } from "@/components/legal-page";
import { termsFor, termsUpdated } from "@/lib/legal";
import { asFeeView } from "@/lib/roomsetu/fee-copy";
import { getFeeView } from "@/lib/roomsetu/pricing-api";

export const Route = createFileRoute("/terms")({
  loader: () => getFeeView(),
  head: () => pageHead("Terms of use", { description: "Roomeo's terms: we're a platform not a landlord, our fees and refunds, fair use, and Mangaluru jurisdiction." }),
  component: Terms,
});

function Terms() {
  const fee = asFeeView(Route.useLoaderData());
  return <LegalPage title="Terms of use" intro="Short version: Roomeo connects people; the rental deal is between tenant and owner. Be real, be kind, and here's exactly what we charge and when you get money back." sections={termsFor(fee)} updated={termsUpdated(fee)} />;
}
