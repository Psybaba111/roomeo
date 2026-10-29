import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { LegalPage } from "@/components/legal-page";
import { PRIVACY } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => pageHead("Privacy policy", { description: "What Roomeo collects, why, who sees it, how long we keep it and your rights under India's DPDP Act, 2023." }),
  component: () => <LegalPage title="Privacy policy" intro="Short version: we collect only what we need to help you find a room or a flatmate, we never sell your data, and you can ask us to delete it." sections={PRIVACY} />,
});
