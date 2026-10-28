import { useEffect, useState } from "react";
import { ListPlus } from "@phosphor-icons/react";
import { errText } from "@/lib/ui-text";
import { mySquads, shortlistListing } from "@/lib/roomsetu/squad-api";
import { btnSmall, card, input } from "@/components/ui-tokens";

/** Lets squad members add this flat to their squad's shortlist. */
export function SquadShortlistButton({ listingId }: { listingId: string }) {
  const [squads, setSquads] = useState<Awaited<ReturnType<typeof mySquads>>>([]);
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void mySquads()
      .then((s) => {
        setSquads(s);
        setPick(s[0]?.id ?? "");
      })
      .catch(() => undefined);
  }, []);
  if (!squads.length) return null;
  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-sm ${card}`}
      data-testid="squad-shortlist"
    >
      {squads.length > 1 ? (
        <select
          className={`${input} h-10 w-auto text-sm`}
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Squad"
        >
          {squads.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        disabled={busy}
        className={btnSmall}
        onClick={() => {
          setBusy(true);
          void shortlistListing({ data: { squadId: pick, listingId } })
            .then(() => setMsg({ ok: true, text: "Added to your squad shortlist." }))
            .catch((e) => setMsg({ ok: false, text: errText(e) }))
            .finally(() => setBusy(false));
        }}
      >
        <ListPlus size={16} aria-hidden="true" /> Add to{" "}
        {squads.length === 1 ? squads[0].name : "squad"} shortlist
      </button>
      {msg ? (
        <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-muted" : "text-danger"}>
          {msg.text}
        </span>
      ) : null}
    </div>
  );
}
