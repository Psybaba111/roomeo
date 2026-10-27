import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth-panel";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/login")({
  head: () => pageHead("Sign in"),
  component: () => (
    <Shell>
      <AuthPanel mode="login" />
    </Shell>
  ),
});
