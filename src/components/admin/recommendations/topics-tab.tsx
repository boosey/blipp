import { useState, useEffect, useCallback, Fragment } from "react";
import { Search, ChevronRight, ChevronDown, Hash, Podcast } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFetch } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/admin";
import { relativeTime, categoryColor } from "./helpers";
import type { TopicRow, EpisodeTopic } from "./types";

export interface TopicsTabProps {
  apiFetch: ReturnType<typeof useAdminFetch>;
}

export function TopicsTab({ apiFetch }: TopicsTabProps) {
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedPodcast, setExpandedPodcast] = useState<string | null>(null);
  const [episodeTopics, setEpisodeTopics] = useState<Record<string, EpisodeTopic[]>>({});
  const [episodeLoading, setEpisodeLoading] = useState<string | null>(null);
  const pageSize = 20;

  const loadTopics = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (search) params.set("search", search);
    apiFetch<PaginatedResponse<TopicRow>>(`/recommendations/topics?${params}`)
      .then((r) => {
        setTopics(r.data);
        setTotal(r.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, page, search]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
    },
    []
  );

  const handleExpandPodcast = useCallback(
    (podcastId: string) => {
      if (expandedPodcast === podcastId) {
        setExpandedPodcast(null);
        return;
      }
      setExpandedPodcast(podcastId);
      if (!episodeTopics[podcastId]) {
        setEpisodeLoading(podcastId);
        apiFetch<{ data: EpisodeTopic[] }>(
          `/recommendations/topics/${podcastId}/episodes`
        )
          .then((r) =>
            setEpisodeTopics((prev) => ({ ...prev, [podcastId]: r.data }))
          )
          .catch(console.error)
          .finally(() => setEpisodeLoading(null));
      }
    },
    [apiFetch, expandedPodcast, episodeTopics]
  );

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
        <Input
          placeholder="Search podcasts..."
          value={search}
          onChange={handleSearchChange}
          className="pl-9 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] placeholder:text-[#9CA3AF]/50"
        />
      </div>

      {loading && topics.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 bg-white/5 rounded-lg" />
          ))}
        </div>
      ) : topics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
          <Hash className="h-8 w-8 mb-3 opacity-20" />
          <span className="text-xs">No topic data found</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF]">
              Showing {topics.length} of{" "}
              <span className="font-mono tabular-nums text-[#F9FAFB]">{total}</span> podcasts
            </span>
          </div>

          <div className="rounded-lg bg-[#0A1628] border border-white/5 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="w-6" />
                  <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                    Podcast
                  </th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                    Categories
                  </th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                    Topics
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium w-16">
                    Count
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                    Computed
                  </th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => {
                  const isExpanded = expandedPodcast === t.podcastId;
                  const episodes = episodeTopics[t.podcastId];
                  const isLoadingEps = episodeLoading === t.podcastId;

                  return (
                    <Fragment key={t.podcastId}>
                      <tr
                        className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] cursor-pointer"
                        onClick={() => handleExpandPodcast(t.podcastId)}
                      >
                        <td className="pl-2 py-2">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-[#9CA3AF]" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-[#9CA3AF]" />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {t.podcastImageUrl ? (
                              <img
                                src={t.podcastImageUrl}
                                alt=""
                                className="h-7 w-7 rounded object-cover shrink-0"
                              />
                            ) : (
                              <div className="h-7 w-7 rounded bg-[#1A2942] flex items-center justify-center shrink-0">
                                <Podcast className="h-3.5 w-3.5 text-[#9CA3AF]/40" />
                              </div>
                            )}
                            <span className="text-[11px] text-[#F9FAFB] truncate max-w-[120px]">
                              {t.podcastTitle}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {t.categories.slice(0, 2).map((cat) => {
                              const col = categoryColor(cat);
                              return (
                                <span
                                  key={cat}
                                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                  style={{ backgroundColor: `${col}15`, color: col }}
                                >
                                  {cat}
                                </span>
                              );
                            })}
                            {t.categories.length > 2 && (
                              <span className="text-[9px] text-[#9CA3AF]">
                                +{t.categories.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {t.topicTags.slice(0, 3).map((tag) => {
                              const col = categoryColor(tag);
                              return (
                                <span
                                  key={tag}
                                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                  style={{ backgroundColor: `${col}15`, color: col }}
                                >
                                  {tag}
                                </span>
                              );
                            })}
                            {t.topicTags.length > 3 && (
                              <span className="text-[9px] text-[#9CA3AF]">
                                +{t.topicTags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[#9CA3AF]">
                          {t.topicCount}
                        </td>
                        <td className="px-3 py-2 text-right text-[10px] text-[#9CA3AF]">
                          {relativeTime(t.computedAt)}
                        </td>
                      </tr>

                      {/* Expanded episode rows */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-[#0F1D32] px-4 py-3">
                            {isLoadingEps ? (
                              <div className="space-y-2">
                                {Array.from({ length: 3 }).map((_, i) => (
                                  <Skeleton key={i} className="h-8 bg-white/5 rounded" />
                                ))}
                              </div>
                            ) : !episodes || episodes.length === 0 ? (
                              <div className="text-[10px] text-[#9CA3AF] text-center py-4">
                                No episode-level topics
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {episodes.map((ep) => (
                                  <div
                                    key={ep.episodeId}
                                    className="flex items-center gap-3 rounded bg-[#1A2942]/50 px-3 py-2"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[10px] text-[#F9FAFB] truncate">
                                        {ep.episodeTitle}
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1 shrink-0">
                                      {ep.topicTags.slice(0, 4).map((tag) => {
                                        const col = categoryColor(tag);
                                        return (
                                          <span
                                            key={tag}
                                            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                            style={{
                                              backgroundColor: `${col}15`,
                                              color: col,
                                            }}
                                          >
                                            {tag}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    <span className="text-[10px] text-[#9CA3AF] shrink-0">
                                      {relativeTime(ep.computedAt)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="text-xs text-[#9CA3AF] hover:text-[#F9FAFB]"
              >
                Previous
              </Button>
              <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="text-xs text-[#9CA3AF] hover:text-[#F9FAFB]"
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
