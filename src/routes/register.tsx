import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth-panel";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/register")({
  head: () => pageHead("Create an account"),
  component: () => (
    <Shell>
      <AuthPanel mode="register" />
    </Shell>
  ),
});
