import { useEffect, useState, useCallback, useMemo } from "react";
import { Headphones, Play } from "lucide-react";
import { toast } from "sonner";
import { useApiFetch } from "../lib/api";
import { useFetch } from "../lib/use-fetch";
import { SwipeableFeedItem } from "../components/swipeable-feed-item";
import { FeedSkeleton } from "../components/skeletons/feed-skeleton";
import { EmptyState } from "../components/empty-state";
import { CuratedRow } from "../components/curated-row";
import type { FeedItem, FeedFilter, FeedCounts } from "../types/feed";
import type { CuratedResponse } from "../types/recommendations";
import { groupByDate } from "../lib/feed-utils";
import { usePullToRefresh } from "../hooks/use-pull-to-refresh";
import { useAudio } from "../contexts/audio-context";
import { InstallPrompt } from "../components/install-prompt";

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "subscription", label: "Subscriptions" },
  { key: "on_demand", label: "On Demand" },
  { key: "creating", label: "Creating" },
];

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

export function Home() {
  const apiFetch = useApiFetch();
  const audio = useAudio();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>("all");

  const { data: counts } = useFetch<FeedCounts>("/feed/counts");
  const { data: curatedData } = useFetch<CuratedResponse>("/recommendations/curated");

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

  const { indicator: pullIndicator, bind: pullBind } = usePullToRefresh({
    onRefresh: fetchFeed,
  });

  useEffect(() => {
    setLoading(true);
    fetchFeed();
  }, [fetchFeed]);

  // Poll every 5s if any items are pending/processing
  useEffect(() => {
    const hasActive = items.some(
      (i) => i.status === "PENDING" || i.status === "PROCESSING"
    );
    if (!hasActive) return;

    const interval = setInterval(fetchFeed, 5000);
    return () => clearInterval(interval);
  }, [items, fetchFeed]);

  // Background poll every 60s to pick up new feed items
  useEffect(() => {
    const interval = setInterval(fetchFeed, 60_000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  // Sort by request time, youngest first
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

  function handlePlay(feedItemId: string) {
    // Mark listened optimistically — non-critical, no toast
    apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" }).catch(
      () => {}
    );
  }

  function handlePlayAll() {
    if (unlistenedReady.length === 0) return;
    audio.playAll(unlistenedReady);
    // Mark all as listened optimistically
    const ids = new Set(unlistenedReady.map((i) => i.id));
    setItems((prev) =>
      prev.map((i) => (ids.has(i.id) ? { ...i, listened: true } : i))
    );
    for (const item of unlistenedReady) {
      handlePlay(item.id);
    }
  }

  function handleToggleListened(feedItemId: string, listened: boolean) {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === feedItemId ? { ...i, listened } : i))
    );
    apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" }).catch(() => {
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => (i.id === feedItemId ? { ...i, listened: !listened } : i))
      );
      toast.error("Failed to update");
    });
  }

  async function handleEpisodeVote(episodeId: string, vote: number) {
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
  }

  function handleRemove(feedItemId: string) {
    const removedItem = items.find((i) => i.id === feedItemId);
    if (!removedItem) return;

    // Optimistic removal
    setItems((prev) => prev.filter((i) => i.id !== feedItemId));

    const timeoutId = setTimeout(() => {
      apiFetch(`/feed/${feedItemId}`, { method: "DELETE" }).catch(() => {
        // Restore on failure
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
  }

  if (loading) {
    return <FeedSkeleton />;
  }

  if (items.length === 0 && filter === "all") {
    return (
      <EmptyState
        icon={Headphones}
        title="No briefings yet"
        description="Subscribe to your favorite podcasts and we'll create bite-sized briefings for you."
        action={{ label: "Discover Podcasts", to: "/discover" }}
      />
    );
  }

  return (
    <div {...pullBind}>
      {pullIndicator}
      <h1 className="text-xl font-bold mb-3">Your Feed</h1>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x-mandatory mb-3">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors snap-start ${
              filter === key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {key === "new" && counts?.unlistened
              ? `${label} (${counts.unlistened})`
              : label}
          </button>
        ))}
      </div>

      <InstallPrompt />

      {/* Suggested Next Blipps */}
      {curatedData?.rows?.[0]?.items && curatedData.rows[0].items.length > 0 && (
        <div className="mb-3">
          <CuratedRow row={{ title: "Suggested Next Blipp", type: curatedData.rows[0].type, items: curatedData.rows[0].items.slice(0, 6) }} />
        </div>
      )}

      {/* Play All button */}
      {unlistenedReady.length > 0 && (
        <button
          onClick={handlePlayAll}
          className="flex items-center gap-2 mb-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-transform duration-75"
        >
          <Play className="w-4 h-4" />
          Play All ({unlistenedReady.length})
        </button>
      )}

      {/* Date-grouped feed */}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No items match this filter.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.label}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.items.map((item, index) => (
                  <div
                    key={item.id}
                    className="feed-item-enter"
                    style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
                  >
                    <SwipeableFeedItem
                      item={item}
                      onPlay={handlePlay}
                      onToggleListened={handleToggleListened}
                      onRemove={handleRemove}
                      onEpisodeVote={handleEpisodeVote}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
