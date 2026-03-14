import { Skeleton } from "../ui/skeleton";

export function FeedSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3"
        >
          <Skeleton className="w-2 h-2 rounded-full" />
          <Skeleton className="w-12 h-12 rounded flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-8 rounded" />
              <Skeleton className="h-4 w-12 rounded" />
            </div>
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}
