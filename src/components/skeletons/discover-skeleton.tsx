import { Skeleton } from "../ui/skeleton";

export function DiscoverSkeleton() {
  return (
    <div className="space-y-2 mt-4">
      <Skeleton className="h-6 w-32" />
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3"
        >
          <Skeleton className="w-14 h-14 rounded flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
          </div>
          <Skeleton className="w-4 h-4 rounded self-center" />
        </div>
      ))}
    </div>
  );
}
