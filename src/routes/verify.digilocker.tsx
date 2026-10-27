import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell, errText } from "@/components/shell";
import { completeDigilocker } from "@/lib/roomsetu/trust-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/verify/digilocker")({
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
  useEffect(() => {
    if (!user) return;
    void completeDigilocker({ data: search })
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
  }, [user, search.code, search.state, search.error]);
  return (
    <Shell>
      <h1 className="font-display text-4xl">DigiLocker</h1>
      <p className={`mt-3 max-w-xl ${bad ? "text-danger" : "text-muted"}`}>{message}</p>
      <Link to="/verification" className="mt-6 inline-block font-semibold text-brand">Back to identity</Link>
    </Shell>
  );
}
