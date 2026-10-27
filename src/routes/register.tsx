import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth-panel";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/register")({
  component: () => (
    <Shell>
      <AuthPanel mode="register" />
    </Shell>
  ),
});
