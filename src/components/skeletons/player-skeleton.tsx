import { Skeleton } from "../ui/skeleton";

export function PlayerSkeleton() {
  return (
    <div className="flex flex-col items-center gap-6 px-4 pt-8">
      <Skeleton className="w-48 h-48 rounded-2xl" />
      <div className="text-center space-y-2 w-full">
        <Skeleton className="h-5 w-48 mx-auto" />
        <Skeleton className="h-4 w-32 mx-auto" />
        <Skeleton className="h-3 w-20 mx-auto" />
      </div>
      <Skeleton className="h-1 w-full max-w-sm rounded" />
      <div className="flex items-center gap-6">
        <Skeleton className="w-8 h-6 rounded" />
        <Skeleton className="w-14 h-14 rounded-full" />
        <Skeleton className="w-8 h-6 rounded" />
      </div>
    </div>
  );
}
