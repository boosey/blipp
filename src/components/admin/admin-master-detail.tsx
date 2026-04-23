import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminMasterDetailProps {
  list: ReactNode;
  detail: ReactNode;
  isSelected: boolean;
  onBack: () => void;
  isEmpty?: boolean;
  emptyMessage?: string;
  loading?: boolean;
  detailLoading?: boolean;
  listWidth?: string; // e.g. "md:w-[40%]"
}

export function AdminMasterDetail({
  list,
  detail,
  isSelected,
  onBack,
  isEmpty,
  emptyMessage = "Select an item to view details",
  loading,
  detailLoading,
  listWidth = "md:w-[40%]",
}: AdminMasterDetailProps) {
  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-6.5rem)] md:h-[calc(100vh-7rem)]">
      {/* Master List */}
      <div
        className={cn(
          "w-full flex flex-col gap-3 min-h-0",
          listWidth,
          isSelected && "hidden md:flex"
        )}
      >
        {list}
      </div>

      {/* Detail View */}
      <div
        className={cn(
          "flex-1 flex flex-col min-h-0 min-w-0",
          !isSelected && "hidden md:flex"
        )}
      >
        {detailLoading && !isSelected ? (
          <div className="flex-1 space-y-4">
            <Skeleton className="h-24 bg-white/5 rounded-lg" />
            <Skeleton className="h-10 bg-white/5 rounded-lg" />
            <Skeleton className="h-64 bg-white/5 rounded-lg" />
          </div>
        ) : isSelected ? (
          <div className="flex flex-col gap-4 h-full min-h-0">
            <button
              onClick={onBack}
              className="md:hidden flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#F9FAFB] shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to list
            </button>
            {detail}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#9CA3AF]">
            <span className="text-sm">{emptyMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
