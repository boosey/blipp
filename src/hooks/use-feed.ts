import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useApiFetch } from "../lib/api-client";
import { useFetch } from "../lib/use-fetch";
import type { FeedItem, FeedFilter, FeedCounts } from "../types/feed";
import { groupByDate } from "../lib/feed-utils";

const GENERATING_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

function buildFilterParams(filter: FeedFilter): string {
  switch (filter) {
    case "new":
      return "&listened=false";
    case "subscription":
      return "&source=SUBSCRIPTION";
    case "on_demand":
      return "&source=ON_DEMAND";
    case "creating":
      return "&status=PENDING";
    default:
      return "";
  }
}

export function useFeed() {
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [generatingTimedOut, setGeneratingTimedOut] = useState(false);

  const { data: counts } = useFetch<FeedCounts>("/feed/counts");

  // Track "just onboarded" state via sessionStorage
  const justOnboarded = sessionStorage.getItem("blipp-just-onboarded") === "1";
  const generatingStartRef = useRef<number | null>(
    justOnboarded ? Date.now() : null
  );

  const fetchFeed = useCallback(async () => {
    try {
      const params = buildFilterParams(filter);
      const data = await apiFetch<{ items: FeedItem[] }>(`/feed?limit=50${params}`);
      setItems(data.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, filter]);

  useEffect(() => {
    setLoading(true);
    fetchFeed();
  }, [fetchFeed]);

  // Poll every 5s if any items are pending/processing
  useEffect(() => {
    const hasActive = items.some(
      (i) => i.status === "PENDING" || i.status === "PROCESSING"
    );
    if (!hasActive && !justOnboarded) return;

    const interval = setInterval(fetchFeed, 5000);
    return () => clearInterval(interval);
  }, [items, fetchFeed, justOnboarded]);

  // Background poll every 60s to pick up new feed items
  useEffect(() => {
    const interval = setInterval(fetchFeed, 60_000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  // Generating state timeout
  useEffect(() => {
    if (!justOnboarded || generatingTimedOut) return;

    const elapsed = Date.now() - (generatingStartRef.current ?? Date.now());
    const remaining = GENERATING_TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      setGeneratingTimedOut(true);
      return;
    }

    const timer = setTimeout(() => setGeneratingTimedOut(true), remaining);
    return () => clearTimeout(timer);
  }, [justOnboarded, generatingTimedOut]);

  // Determine generating state
  const pendingItems = items.filter(
    (i) => i.status === "PENDING" || i.status === "PROCESSING"
  );
  const readyItems = items.filter((i) => i.status === "READY");
  const failedItems = items.filter((i) => i.status === "FAILED");

  const isGenerating =
    justOnboarded &&
    !generatingTimedOut &&
    (items.length === 0 || readyItems.length < items.length - failedItems.length);

  // Clear "just onboarded" flag once all items are ready (or timed out)
  useEffect(() => {
    if (!justOnboarded) return;
    const allDone = items.length > 0 && pendingItems.length === 0;
    if (allDone || generatingTimedOut) {
      sessionStorage.removeItem("blipp-just-onboarded");
    }
  }, [items, pendingItems.length, justOnboarded, generatingTimedOut]);

  const isZeroSubscriptionUser =
    !loading && items.length === 0 && filter === "all" && !justOnboarded;

  const sortedItems = useMemo(() => {
    const filtered =
      filter === "creating"
        ? items.filter((i) => i.status === "PENDING" || i.status === "PROCESSING")
        : items;

    return [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [items, filter]);

  const groups = useMemo(() => groupByDate(sortedItems), [sortedItems]);

  const unlistenedReady = useMemo(
    () => sortedItems.filter((i) => !i.listened && i.status === "READY"),
    [sortedItems]
  );

  const markListened = useCallback(async (feedItemId: string) => {
    // Mark listened optimistically
    try {
      await apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" });
    } catch (e) {
      // Non-critical
    }
  }, [apiFetch]);

  const voteEpisode = useCallback(async (episodeId: string, vote: number) => {
    const prevItems = items;
    setItems((prev) =>
      prev.map((i) => (i.episode.id === episodeId ? { ...i, episodeVote: vote } : i))
    );
    try {
      await apiFetch(`/podcasts/episodes/vote/${episodeId}`, {
        method: "POST",
        body: JSON.stringify({ vote }),
      });
    } catch {
      setItems(prevItems);
    }
  }, [apiFetch, items]);

  const removeItem = useCallback(async (feedItemId: string) => {
    const removedItem = items.find((i) => i.id === feedItemId);
    if (!removedItem) return;

    setItems((prev) => prev.filter((i) => i.id !== feedItemId));

    const timeoutId = setTimeout(() => {
      apiFetch(`/feed/${feedItemId}`, { method: "DELETE" }).catch(() => {
        setItems((prev) => [...prev, removedItem].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
        toast.error("Failed to remove item");
      });
    }, 5000);

    toast("Item removed", {
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timeoutId);
          setItems((prev) => [...prev, removedItem].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          ));
        },
      },
      duration: 5000,
    });
  }, [apiFetch, items]);

  const cancelBriefing = useCallback(async (feedItemId: string) => {
    const item = items.find((i) => i.id === feedItemId);
    if (!item) return;
    const savedStatus = item.status;

    setItems((prev) => prev.map((i) => i.id === feedItemId ? { ...i, status: "CANCELLED" as const } : i));

    try {
      await apiFetch(`/briefings/cancel-by-feed-item/${item.id}`, { method: "POST" });
      toast.success("Briefing cancelled");
    } catch {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: savedStatus } : i));
      toast.error("Failed to cancel briefing");
    }
  }, [apiFetch, items]);

  return {
    items,
    setItems,
    loading,
    filter,
    setFilter,
    counts,
    fetchFeed,
    isGenerating,
    justOnboarded,
    generatingTimedOut,
    isZeroSubscriptionUser,
    sortedItems,
    groups,
    unlistenedReady,
    pendingItems,
    readyItems,
    failedItems,
    markListened,
    voteEpisode,
    removeItem,
    cancelBriefing,
  };
}
