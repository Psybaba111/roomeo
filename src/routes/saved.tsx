import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell, errText } from "@/components/shell";
import { RoomCard } from "@/components/cards";
import { listSaved } from "@/lib/roomsetu/account-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/saved")({
  component: () => (
    <NeedAccount next="/saved">
      <Saved />
    </NeedAccount>
  ),
});

function Saved() {
  const { user } = useCurrentUserState();
  const [rooms, setRooms] = useState<Awaited<ReturnType<typeof listSaved>>>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    void listSaved().then(setRooms).catch((e) => setError(errText(e)));
  }, [user]);
  return (
    <Shell>
      <h1 className="font-display text-4xl">Saved rooms</h1>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      {rooms.length === 0 ? <p className="mt-4 text-muted">Nothing saved yet. Tap Save on a room you might visit.</p> : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => <RoomCard key={room.id} room={room} />)}
      </div>
    </Shell>
  );
}
