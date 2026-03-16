import { useEffect, useState, useCallback } from "react";
import { Headphones } from "lucide-react";
import { toast } from "sonner";
import { useApiFetch } from "../lib/api";
import { SwipeableFeedItem } from "../components/swipeable-feed-item";
import { FeedSkeleton } from "../components/skeletons/feed-skeleton";
import { EmptyState } from "../components/empty-state";
import type { FeedItem } from "../types/feed";
import { usePullToRefresh } from "../hooks/use-pull-to-refresh";
import { InstallPrompt } from "../components/install-prompt";

export function Home() {
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: FeedItem[] }>("/feed?limit=50");
      setItems(data.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const { indicator: pullIndicator, bind: pullBind } = usePullToRefresh({
    onRefresh: fetchFeed,
  });

  useEffect(() => {
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

  function handlePlay(feedItemId: string) {
    // Mark listened optimistically — non-critical, no toast
    apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" }).catch(
      () => {}
    );
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

  if (items.length === 0) {
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
      <h1 className="text-xl font-bold mb-4">Your Feed</h1>
      <InstallPrompt />
      <div className="space-y-2">
        {items.map((item) => (
          <SwipeableFeedItem
            key={item.id}
            item={item}
            onPlay={handlePlay}
            onToggleListened={handleToggleListened}
            onRemove={handleRemove}
          />
        ))}
      </div>
    </div>
  );
}
