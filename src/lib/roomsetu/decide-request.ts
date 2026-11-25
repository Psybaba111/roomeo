import { setApplication } from "@/lib/roomsetu/account-api";
import { trackOwnerDecision } from "@/lib/analytics/funnel";

/** Owner accepts / declines a request (same server action), then fires owner_responded / request_accepted once. */
export async function decideRequest(id: string, status: "ACCEPTED" | "DECLINED") {
  const res = await setApplication({ data: { id, status } });
  try {
    trackOwnerDecision(status, res);
  } catch {
    /* analytics never breaks the decision */
  }
  return res;
}
