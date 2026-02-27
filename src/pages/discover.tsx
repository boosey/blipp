import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { PodcastCard } from "../components/podcast-card";

/** Shape of a podcast returned by the API. */
interface Podcast {
  id: string;
  title: string;
  author: string;
  description: string;
  imageUrl: string;
}

/** Discover page with podcast search and subscription management. */
export function Discover() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Podcast[]>([]);
  const [subscriptions, setSubscriptions] = useState<Podcast[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const data = await apiFetch<Podcast[]>("/podcasts/subscriptions");
      setSubscriptions(data);
    } catch {
      // Silently handle — subscriptions section will be empty
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  /** Searches for podcasts via the API. */
  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch<Podcast[]>(
        `/podcasts/search?q=${encodeURIComponent(query)}`
      );
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  /** Triggers search on Enter key press. */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  const subscribedIds = new Set(subscriptions.map((s) => s.id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-4">Discover Podcasts</h1>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search podcasts..."
            className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-6 py-2 bg-zinc-50 text-zinc-950 font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {subscriptions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Your Subscriptions</h2>
          <div className="space-y-3">
            {subscriptions.map((podcast) => (
              <PodcastCard
                key={podcast.id}
                {...podcast}
                isSubscribed={true}
                onToggle={fetchSubscriptions}
              />
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Search Results</h2>
          <div className="space-y-3">
            {results.map((podcast) => (
              <PodcastCard
                key={podcast.id}
                {...podcast}
                isSubscribed={subscribedIds.has(podcast.id)}
                onToggle={fetchSubscriptions}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
