import { Skeleton } from "../ui/skeleton";

export function FeedSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3"
        >
          <Skeleton className="w-12 h-12 rounded flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
