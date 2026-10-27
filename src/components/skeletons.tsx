export function RoomCardSkeleton() {
  return (
    <div aria-hidden className="overflow-hidden rounded-3xl border border-line bg-card">
      <div className="skeleton aspect-[4/3]" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-5 w-3/4 rounded-full" />
        <div className="skeleton h-4 w-1/2 rounded-full" />
        <div className="flex gap-2">
          <div className="skeleton h-6 w-20 rounded-full" />
          <div className="skeleton h-6 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function RoomGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading beds" className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <RoomCardSkeleton key={i} />
      ))}
    </div>
  );
}
