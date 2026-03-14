import { Skeleton } from "../ui/skeleton";

export function LibrarySkeleton() {
  return (
    <div>
      <Skeleton className="h-6 w-24 mb-4" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="w-full aspect-square rounded-lg" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
