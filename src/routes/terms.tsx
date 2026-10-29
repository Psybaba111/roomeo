import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { LegalPage } from "@/components/legal-page";
import { TERMS } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => pageHead("Terms of use", { description: "Roomeo's terms: we're a platform not a landlord, our fees and refunds, fair use, and Mangaluru jurisdiction." }),
  component: () => <LegalPage title="Terms of use" intro="Short version: Roomeo connects people; the rental deal is between tenant and owner. Be real, be kind, and here's exactly what we charge and when you get money back." sections={TERMS} />,
});
