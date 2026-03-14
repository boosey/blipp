import { useEffect, useState, useCallback } from "react";
import { Headphones } from "lucide-react";
import { toast } from "sonner";
import { useApiFetch } from "../lib/api";
import { FeedItemCard } from "../components/feed-item";
import { FeedSkeleton } from "../components/skeletons/feed-skeleton";
import { EmptyState } from "../components/empty-state";
import type { FeedItem } from "../types/feed";

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
    <div>
      <h1 className="text-xl font-bold mb-4">Your Feed</h1>
      <div className="space-y-2">
        {items.map((item) => (
          <FeedItemCard key={item.id} item={item} onPlay={handlePlay} />
        ))}
      </div>
    </div>
  );
}
