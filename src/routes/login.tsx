import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth-panel";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/login")({
  component: () => (
    <Shell>
      <AuthPanel mode="login" />
    </Shell>
  ),
});
