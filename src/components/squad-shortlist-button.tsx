import { useEffect, useState } from "react";
import { errText } from "@/lib/ui-text";
import { mySquads, shortlistListing } from "@/lib/roomsetu/squad-api";

/** Lets squad members add this flat to their squad's shortlist. */
export function SquadShortlistButton({ listingId }: { listingId: string }) {
  const [squads, setSquads] = useState<Awaited<ReturnType<typeof mySquads>>>([]);
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState("");
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
      className="flex flex-wrap items-center gap-2 rounded-3xl border border-line p-3 text-sm"
      data-testid="squad-shortlist"
    >
      {squads.length > 1 ? (
        <select
          className="h-10 rounded-full border border-line bg-transparent px-3"
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
        className="h-10 rounded-full bg-ink px-4 font-semibold text-card"
        onClick={() =>
          void shortlistListing({ data: { squadId: pick, listingId } })
            .then(() => setMsg("Added to your squad shortlist."))
            .catch((e) => setMsg(errText(e)))
        }
      >
        Add to {squads.length === 1 ? squads[0].name : "squad"} shortlist
      </button>
      {msg ? <span className="text-muted">{msg}</span> : null}
    </div>
  );
}
