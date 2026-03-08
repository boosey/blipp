import { useEffect, useState, useCallback } from "react";
import { useApiFetch } from "../lib/api";
import { FeedItemCard } from "../components/feed-item";
import type { FeedItem } from "../types/feed";

export function Home() {
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: FeedItem[] }>("/feed?limit=50");
      setItems(data.items);
    } catch {
      // Silently handle
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

  function handlePlay(feedItemId: string) {
    // Mark listened optimistically
    apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" }).catch(
      () => {}
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-zinc-400 text-center">No briefings yet.</p>
        <p className="text-zinc-500 text-sm text-center">
          Subscribe to podcasts or request on-demand briefings to fill your
          feed.
        </p>
      </div>
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
