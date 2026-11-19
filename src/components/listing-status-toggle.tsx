import { useState } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import { errText } from "@/lib/ui-text";
import { adminSetListing } from "@/lib/roomsetu/admin-api";
import { setListingStatus } from "@/lib/roomsetu/account-api";

/** Pause / go live for a listing. Owners use their own rule (phone + ID verified); operators go through the admin action. */
export function ListingStatusToggle({ id, status, asAdmin, onChanged }: { id: string; status: string; asAdmin: boolean; onChanged: (status: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (status === "REMOVED") return null;
  const live = status === "ACTIVE";
  const next = live ? "PAUSED" : "ACTIVE";
  const run = () => {
    setBusy(true);
    setMsg(null);
    const call = asAdmin
      ? adminSetListing({ data: { id, action: live ? "pause" : "activate" } }).then((r) => r.message)
      : setListingStatus({ data: { id, status: next } }).then(() => (live ? "Paused. Hidden from search." : "You're live ✓"));
    void call
      .then((text) => {
        setMsg({ ok: true, text });
        onChanged(next);
      })
      .catch((e) => setMsg({ ok: false, text: errText(e) }))
      .finally(() => setBusy(false));
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3" data-testid="listing-status-toggle">
      <button type="button" disabled={busy} onClick={run} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-card disabled:opacity-60">
        {live ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />} {busy ? "Saving…" : live ? "Pause listing" : "Go live"}
      </button>
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-brand" : "text-danger"}`}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
