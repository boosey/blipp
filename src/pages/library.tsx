import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useApiFetch } from "../lib/api";

interface SubscribedPodcast {
  id: string;
  podcastId: string;
  podcast: {
    id: string;
    title: string;
    imageUrl: string | null;
    author: string | null;
  };
}

export function LibraryPage() {
  const apiFetch = useApiFetch();
  const [subscriptions, setSubscriptions] = useState<SubscribedPodcast[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const data = await apiFetch<{ subscriptions: SubscribedPodcast[] }>(
        "/podcasts/subscriptions"
      );
      setSubscriptions(data.subscriptions);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-zinc-400 text-center">No subscriptions yet.</p>
        <p className="text-zinc-500 text-sm text-center">
          Search for podcasts in Discover and subscribe to your favorites.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Library</h1>
      <div className="grid grid-cols-3 gap-3">
        {subscriptions.map((sub) => (
          <Link
            key={sub.id}
            to={`/discover/${sub.podcast.id}`}
            className="flex flex-col items-center gap-2"
          >
            {sub.podcast.imageUrl ? (
              <img
                src={sub.podcast.imageUrl}
                alt={sub.podcast.title}
                className="w-full aspect-square rounded-lg object-cover"
              />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-zinc-800" />
            )}
            <p className="text-xs text-center font-medium truncate w-full">
              {sub.podcast.title}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
