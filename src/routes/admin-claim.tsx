import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { adminBootstrapOpen, claimAdmin } from "@/lib/roomsetu/admin-bootstrap-api";
import { btnPrimary, card } from "@/components/ui-tokens";

/** One-time first admin claim. Only works while ADMIN_BOOTSTRAP_TOKEN is set and no admin exists. */
export const Route = createFileRoute("/admin-claim")({
  head: () => pageHead("Claim operator access", { noindex: true }),
  component: () => (
    <NeedAccount next="/admin-claim">
      <Claim />
    </NeedAccount>
  ),
});

function Claim() {
  const [open, setOpen] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void adminBootstrapOpen().then((r) => setOpen(r.open)).catch(() => setOpen(false));
  }, []);
  return (
    <Shell>
      <section className={`mx-auto mt-10 max-w-md ${card}`}>
        <h1 className="text-2xl font-semibold">Claim operator access</h1>
        {open === false ? <p className="mt-3 text-sm text-muted">This is switched off.</p> : null}
        {open ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setMsg("");
              void claimAdmin({ data: { token } })
                .then(() => setDone(true))
                .catch((err) => setMsg(errText(err)))
                .finally(() => setBusy(false));
            }}
          >
            <p className="text-sm text-muted">Only for the very first operator. Your phone must be verified.</p>
            <input className="h-12 w-full rounded-xl border border-line bg-paper px-3" type="password" autoComplete="off" placeholder="Bootstrap token" value={token} onChange={(e) => setToken(e.target.value)} required data-testid="bootstrap-token" />
            <button type="submit" disabled={busy} className={btnPrimary}>{busy ? "Checking…" : "Claim"}</button>
            {msg ? <p className="text-sm text-danger">{msg}</p> : null}
          </form>
        ) : null}
        {done ? (
          <p className="mt-4 text-sm font-semibold" data-testid="claim-done">
            Done. You are the operator. <Link to="/admin" className="underline">Open the desk</Link>. Now remove ADMIN_BOOTSTRAP_TOKEN.
          </p>
        ) : null}
      </section>
    </Shell>
  );
}
