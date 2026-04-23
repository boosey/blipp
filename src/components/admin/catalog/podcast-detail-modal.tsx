import { useState, useEffect } from "react";
import {
  Rss,
  ExternalLink,
  Copy,
  Pause,
  Archive,
  Trash2,
  Clock,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAdminFetch } from "@/lib/api-client";
import type { AdminPodcastDetail } from "@/types/admin";
import { HealthBadge, StatusBadge } from "./catalog-badges";
import { ClipRow } from "./clip-row";
import { relativeTime } from "./catalog-utils";

export interface PodcastDetailModalProps {
  podcastId: string | null;
  open: boolean;
  onClose: () => void;
}

export function PodcastDetailModal({
  podcastId,
  open,
  onClose,
}: PodcastDetailModalProps) {
  const apiFetch = useAdminFetch();
  const [detail, setDetail] = useState<AdminPodcastDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!podcastId || !open) { setDetail(null); return; }
    setLoading(true);
    apiFetch<{ data: AdminPodcastDetail }>(`/podcasts/${podcastId}`)
      .then((r) => setDetail(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [podcastId, open, apiFetch]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[90vw] w-[50vw] max-h-[90vh] overflow-hidden flex flex-col bg-[#0F1D32] border-white/10 text-[#F9FAFB] p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{detail?.title ?? "Podcast Details"}</DialogTitle>
        {loading || !detail ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-16 w-16 rounded-lg bg-white/5" />
            <Skeleton className="h-4 w-3/4 bg-white/5" />
            <Skeleton className="h-3 w-1/2 bg-white/5" />
            <Skeleton className="h-32 bg-white/5 rounded" />
          </div>
        ) : (
          <>
            {/* Top section */}
            <div className="shrink-0 p-4 pb-0 space-y-3">
              {/* Header row */}
              <div className="flex items-start gap-4">
                {detail.imageUrl ? (
                  <img src={detail.imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <Rss className="h-6 w-6 text-[#9CA3AF]/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate">{detail.title}</h3>
                  {detail.author && <p className="text-[11px] text-[#9CA3AF] mt-0.5">{detail.author}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <HealthBadge health={detail.feedHealth} />
                    <StatusBadge status={detail.status} />
                  </div>
                </div>
              </div>

              {/* RSS URL */}
              <div className="flex items-center gap-1.5 rounded-md bg-white/[0.03] p-2">
                <Rss className="h-3 w-3 text-[#9CA3AF] shrink-0" />
                <span className="text-[10px] text-[#9CA3AF] font-mono truncate flex-1">{detail.feedUrl}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-[#9CA3AF] hover:text-[#F9FAFB]"
                  onClick={() => navigator.clipboard.writeText(detail.feedUrl)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-6 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#9CA3AF]">Episodes</span>
                  <span className="font-semibold font-mono tabular-nums">{detail.episodeCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#9CA3AF]">Subscribers</span>
                  <span className="font-semibold font-mono tabular-nums">{detail.subscriberCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#9CA3AF]">Last Fetch</span>
                  <span className="font-semibold font-mono tabular-nums">{relativeTime(detail.lastFetchedAt)}</span>
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 pb-3 border-b border-white/5">
                <Button size="xs" variant="ghost" className="text-[#9CA3AF] hover:text-[#F9FAFB] text-[10px]">
                  <Pause className="h-3 w-3" />
                  Pause
                </Button>
                <Button size="xs" variant="ghost" className="text-[#9CA3AF] hover:text-[#F9FAFB] text-[10px]">
                  <Archive className="h-3 w-3" />
                  Archive
                </Button>
                <Button size="xs" variant="ghost" className="text-[#EF4444] hover:text-[#EF4444]/80 text-[10px]">
                  <Trash2 className="h-3 w-3" />
                  Delete
                </Button>
              </div>
            </div>

            {/* Scrollable episode list */}
            <ScrollArea className="flex-1 min-h-0 px-4 pb-4">
              {detail.episodes.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-[#9CA3AF]">
                  <Clock className="h-5 w-5 mb-1.5 opacity-40" />
                  <span className="text-[10px]">No episodes</span>
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {detail.episodes.map((ep) => (
                    <AccordionItem key={ep.id} value={ep.id} className="border-white/5">
                      <AccordionTrigger className="py-2 hover:no-underline">
                        <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                          <span className="text-[11px] font-medium truncate flex-1 text-left">{ep.title}</span>
                          <span className="text-[10px] text-[#9CA3AF] font-mono shrink-0">{relativeTime(ep.publishedAt)}</span>
                          {ep.durationSeconds != null && (
                            <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums shrink-0">
                              {Math.round(ep.durationSeconds / 60)}m
                            </span>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3">
                        <Tabs defaultValue="overview">
                          <TabsList variant="line" className="bg-transparent border-b border-white/5 mb-2">
                            <TabsTrigger value="overview" className="text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] data-[state=active]:text-[#F9FAFB]">Overview</TabsTrigger>
                            <TabsTrigger value="clips" className="text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] data-[state=active]:text-[#F9FAFB]">
                              Clips ({ep.clips?.length ?? 0})
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="overview">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px]">
                              <div>
                                <span className="text-[10px] text-[#9CA3AF] block">Published</span>
                                <span className="font-mono tabular-nums">{new Date(ep.publishedAt).toLocaleDateString()}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-[#9CA3AF] block">Duration</span>
                                <span className="font-mono tabular-nums">
                                  {ep.durationSeconds != null ? `${Math.round(ep.durationSeconds / 60)}m` : "\u2014"}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-[#9CA3AF] block">Cost</span>
                                <span className="font-mono tabular-nums">
                                  {ep.totalCost != null ? `$${ep.totalCost.toFixed(2)}` : "\u2014"}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-2">
                              {ep.transcriptUrl && (
                                <a
                                  href={ep.transcriptUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] text-[#3B82F6] hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Transcript
                                </a>
                              )}
                              {ep.audioUrl && (
                                <a
                                  href={ep.audioUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] text-[#3B82F6] hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Audio
                                </a>
                              )}
                            </div>
                          </TabsContent>

                          <TabsContent value="clips">
                            {(ep.clips?.length ?? 0) === 0 ? (
                              <div className="text-[10px] text-[#9CA3AF] py-4 text-center">No clips generated</div>
                            ) : (
                              <div className="rounded-md border border-white/5 overflow-hidden">
                                {ep.clips!.map((clip) => (
                                  <ClipRow key={clip.id} clip={clip} />
                                ))}
                              </div>
                            )}
                          </TabsContent>
                        </Tabs>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
