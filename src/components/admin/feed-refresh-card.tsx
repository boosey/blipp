import { useState, useEffect, useCallback } from "react";
import { Rss, AlertTriangle, Clock, Podcast, FileText, Volume2, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFetch } from "@/lib/api-client";
import { relativeTime } from "@/lib/admin-formatters";
import type { FeedRefreshSummary } from "@/types/admin";

export function FeedRefreshCard({ compact = false, className }: { compact?: boolean; className?: string }) {
  const apiFetch = useAdminFetch();
  const [summary, setSummary] = useState<FeedRefreshSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<{ data: FeedRefreshSummary }>("/dashboard/feed-refresh-summary")
      .then((r) => setSummary(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className={cn("rounded-lg bg-[#1A2942] border border-white/5 p-4", className)} data-testid="feed-refresh-card">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32 bg-white/5" />
          <Skeleton className="h-3 w-full bg-white/5" />
          <Skeleton className="h-3 w-3/4 bg-white/5" />
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className="rounded-lg bg-[#1A2942] border border-white/5 px-4 py-3 flex items-center gap-4"
        data-testid="feed-refresh-card"
      >
        <div className="flex items-center gap-2">
          <Rss className="h-4 w-4 text-[#3B82F6]" />
          <span className="text-xs font-semibold text-[#F9FAFB]">Feed Refresh</span>
        </div>
        {summary && (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1 text-[10px] text-[#9CA3AF]">
              <Clock className="h-3 w-3" />
              {relativeTime(summary.lastRunAt)}
            </div>
            <div className="text-[10px] text-[#9CA3AF]">
              <Podcast className="inline h-3 w-3 mr-0.5" />
              <span className="font-mono tabular-nums text-[#F9FAFB]">{summary.totalPodcasts}</span> podcasts
            </div>
            <div className="text-[10px] text-[#9CA3AF]">
              <Database className="inline h-3 w-3 mr-0.5" />
              <span className="font-mono tabular-nums text-[#F9FAFB]">{(summary.totalEpisodes ?? 0).toLocaleString()}</span> episodes
            </div>
            <div className="text-[10px] text-[#9CA3AF]">
              <span className="font-mono tabular-nums text-[#10B981]">{summary.recentEpisodes}</span> new (24h)
            </div>
            <div className="text-[10px] text-[#9CA3AF]">
              <FileText className="inline h-3 w-3 mr-0.5" />
              <span className="font-mono tabular-nums text-[#F9FAFB]">{(summary.prefetchedTranscripts ?? 0).toLocaleString()}</span> transcripts
            </div>
            <div className="text-[10px] text-[#9CA3AF]">
              <Volume2 className="inline h-3 w-3 mr-0.5" />
              <span className="font-mono tabular-nums text-[#F9FAFB]">{(summary.prefetchedAudio ?? 0).toLocaleString()}</span> audio
            </div>
            {summary.feedErrors > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-[#EF4444]">
                <AlertTriangle className="h-3 w-3" />
                {summary.feedErrors} errors
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("rounded-lg bg-[#1A2942] border border-white/5 p-4", className)}
      data-testid="feed-refresh-card"
    >
      <div className="widget-drag-handle flex items-center gap-2 mb-3">
        <Rss className="h-4 w-4 text-[#3B82F6]" />
        <span className="text-sm font-semibold text-[#F9FAFB]">Feed Refresh</span>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-white/[0.03] p-2">
            <div className="text-[10px] text-[#9CA3AF] mb-0.5">Last Run</div>
            <div className="flex items-center gap-1 text-[11px] text-[#F9FAFB]">
              <Clock className="h-3 w-3 text-[#9CA3AF]" />
              {relativeTime(summary.lastRunAt)}
            </div>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2">
            <div className="text-[10px] text-[#9CA3AF] mb-0.5">Podcasts</div>
            <div className="text-[11px] text-[#F9FAFB] flex items-center gap-1">
              <Podcast className="h-3 w-3 text-[#3B82F6]" />
              <span className="font-mono tabular-nums">{summary.totalPodcasts}</span>
              <span className="text-[#9CA3AF]">({summary.podcastsRefreshed} refreshed)</span>
            </div>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2">
            <div className="text-[10px] text-[#9CA3AF] mb-0.5">Total Episodes</div>
            <div className="text-[11px] text-[#F9FAFB] flex items-center gap-1">
              <Database className="h-3 w-3 text-[#3B82F6]" />
              <span className="font-mono tabular-nums">{(summary.totalEpisodes ?? 0).toLocaleString()}</span>
            </div>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2">
            <div className="text-[10px] text-[#9CA3AF] mb-0.5">New Episodes (24h)</div>
            <div className="text-[11px] font-mono tabular-nums text-[#10B981]">{summary.recentEpisodes}</div>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2">
            <div className="text-[10px] text-[#9CA3AF] mb-0.5">Prefetched Transcripts</div>
            <div className="text-[11px] text-[#F9FAFB] flex items-center gap-1">
              <FileText className="h-3 w-3 text-[#10B981]" />
              <span className="font-mono tabular-nums">{(summary.prefetchedTranscripts ?? 0).toLocaleString()}</span>
            </div>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2">
            <div className="text-[10px] text-[#9CA3AF] mb-0.5">Prefetched Audio</div>
            <div className="text-[11px] text-[#F9FAFB] flex items-center gap-1">
              <Volume2 className="h-3 w-3 text-[#10B981]" />
              <span className="font-mono tabular-nums">{(summary.prefetchedAudio ?? 0).toLocaleString()}</span>
            </div>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2">
            <div className="text-[10px] text-[#9CA3AF] mb-0.5">Feed Errors</div>
            <div className={`text-[11px] font-mono tabular-nums flex items-center gap-1 ${summary.feedErrors > 0 ? "text-[#EF4444]" : "text-[#10B981]"}`}>
              {summary.feedErrors > 0 && <AlertTriangle className="h-3 w-3" />}
              {summary.feedErrors}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
