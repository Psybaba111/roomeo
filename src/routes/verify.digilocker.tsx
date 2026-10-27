import { pageHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { completeDigilocker } from "@/lib/roomsetu/trust-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/verify/digilocker")({
  head: () => pageHead("DigiLocker", { noindex: true }),
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
    state: typeof search.state === "string" ? search.state : "",
    error: typeof search.error === "string" ? search.error : "",
  }),
  component: () => (
    <NeedAccount next="/verification">
      <Finish />
    </NeedAccount>
  ),
});

function Finish() {
  const search = Route.useSearch();
  const { user } = useCurrentUserState();
  const [message, setMessage] = useState("Checking DigiLocker…");
  const [bad, setBad] = useState(false);
  const { code, state, error } = search;
  useEffect(() => {
    if (!user) return;
    void completeDigilocker({ data: { code, state, error } })
      .then((res) => {
        if (res.ok) setMessage("DigiLocker passed. Rent can be collected once the other side has passed too.");
        else if (res.retry) {
          setBad(true);
          setMessage("DigiLocker did not pass. You can try once more.");
        } else {
          setBad(true);
          setMessage("DigiLocker failed a second time. Open threads are closed. The desk can pass this, and that pass is not a government check.");
        }
      })
      .catch((e) => {
        setBad(true);
        setMessage(errText(e));
      });
  }, [user, code, state, error]);
  return (
    <Shell>
      <h1 className="font-display text-4xl">DigiLocker</h1>
      <p className={`mt-3 max-w-xl ${bad ? "text-danger" : "text-muted"}`}>{message}</p>
      <Link to="/verification" className="mt-6 inline-block font-semibold text-brand">Back to identity</Link>
    </Shell>
  );
}
