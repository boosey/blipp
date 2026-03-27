import { Skeleton } from "@/components/ui/skeleton";

export function RecommendationsSkeleton() {
  return (
    <div className="flex gap-4 h-full">
      <div className="w-[40%] space-y-3">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 flex-1 bg-white/5 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-9 bg-white/5 rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 bg-white/5 rounded-lg" />
        ))}
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-20 bg-white/5 rounded-lg" />
        <Skeleton className="h-10 bg-white/5 rounded-lg" />
        <Skeleton className="h-48 bg-white/5 rounded-lg" />
      </div>
    </div>
  );
}
