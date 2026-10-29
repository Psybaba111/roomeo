import { createServerFn } from "@tanstack/react-start";
import { planSignInProviders } from "./provider-plan";

/** Public: which sign-in buttons work on this host. No secrets returned. */
export const getSignInProviders = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { brokerClientIsPreview, googleConfigured } = await import("./server");
  const host = getRequest()?.headers.get("host") ?? "";
  return planSignInProviders({ brokerClientIsPreview, host, googleConfigured });
});
