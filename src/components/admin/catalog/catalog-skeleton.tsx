import { Skeleton } from "@/components/ui/skeleton";

export function CatalogSkeleton() {
  return (
    <div className="flex gap-4 h-full">
      <Skeleton className="w-[280px] h-full bg-white/5 rounded-lg shrink-0" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-10 bg-white/5 rounded-lg" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 bg-white/5 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
