import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { RoomCard } from "@/components/cards";
import { listSaved } from "@/lib/roomsetu/account-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ListStatus } from "@/components/list-states";
import { useListLoad } from "@/components/use-list-load";
import { listItems } from "@/lib/ui/list-load";

export const Route = createFileRoute("/saved")({
  head: () => pageHead("Saved beds", { noindex: true }),
  component: () => (
    <NeedAccount next="/saved">
      <Saved />
    </NeedAccount>
  ),
});

function Saved() {
  const { user } = useCurrentUserState();
  const saved = useListLoad(() => listSaved(), Boolean(user));
  const rooms = listItems(saved.state);
  return (
    <Shell>
      <h1 className="font-display text-4xl">Saved rooms</h1>
      <ListStatus
        state={saved.state}
        what="saved rooms"
        onRetry={saved.reload}
        rows={2}
        rowClass="h-72"
        empty={<p>Nothing saved yet. Tap Save on a room you might visit.</p>}
      />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="saved-list">
        {rooms.map((room) => <RoomCard key={room.id} room={room} />)}
      </div>
    </Shell>
  );
}
