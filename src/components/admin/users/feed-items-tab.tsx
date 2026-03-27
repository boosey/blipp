import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AdminFeedItem } from "@/types/admin";
import { formatDate } from "./helpers";

export interface FeedItemsTabProps {
  feedItems: AdminFeedItem[];
}

export function FeedItemsTab({ feedItems }: FeedItemsTabProps) {
  const failed = feedItems.filter((fi) => fi.status === "FAILED");

  return (
    <div className="space-y-3">
      {failed.length > 0 && (
        <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#EF4444] shrink-0" />
          <span className="text-xs text-[#EF4444]">
            {failed.length} failed item{failed.length > 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="rounded-lg bg-[#0A1628] border border-white/5 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Date
              </th>
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Episode
              </th>
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Status
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Duration
              </th>
              <th className="text-center px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Listened
              </th>
            </tr>
          </thead>
          <tbody>
            {feedItems.map((fi) => (
              <tr
                key={fi.id}
                className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-3 py-2 text-[#F9FAFB]">{formatDate(fi.createdAt)}</td>
                <td className="px-3 py-2 text-[#9CA3AF] truncate max-w-[160px]">
                  {fi.episodeTitle || fi.podcastTitle || "-"}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    className={cn(
                      "text-[9px] uppercase",
                      fi.status === "READY"
                        ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
                        : fi.status === "FAILED"
                          ? "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30"
                          : "bg-white/5 text-[#9CA3AF] border-white/10"
                    )}
                  >
                    {fi.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#9CA3AF]">
                  {fi.durationTier}m
                </td>
                <td className="px-3 py-2 text-center">
                  {fi.listened ? (
                    <span className="text-[#10B981]">Yes</span>
                  ) : (
                    <span className="text-[#9CA3AF]">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {feedItems.length === 0 && (
          <div className="text-center py-8 text-[#9CA3AF] text-xs">No feed items yet</div>
        )}
      </div>
    </div>
  );
}
