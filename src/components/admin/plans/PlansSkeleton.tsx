import { Skeleton } from "@/components/ui/skeleton";

export function PlansSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48 bg-white/5 rounded-lg" />
        <Skeleton className="h-8 w-28 bg-white/5 rounded-lg" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}
