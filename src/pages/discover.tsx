import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "../lib/api";
import { PodcastCard } from "../components/podcast-card";

interface PodcastFeed {
  id: string;
  title: string;
  author: string;
  description: string;
  image: string;
  url: string;
}

export function Discover() {
  const apiFetch = useApiFetch();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PodcastFeed[]>([]);
  const [trending, setTrending] = useState<PodcastFeed[]>([]);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const data = await apiFetch<{
        subscriptions: { podcastId: string }[];
      }>("/podcasts/subscriptions");
      setSubscribedIds(new Set(data.subscriptions.map((s) => s.podcastId)));
    } catch {
      // Ignore
    }
  }, [apiFetch]);

  const fetchTrending = useCallback(async () => {
    try {
      const data = await apiFetch<{ feeds: PodcastFeed[] }>("/podcasts/trending");
      setTrending(data.feeds || []);
    } catch {
      // Ignore
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchSubscriptions();
    fetchTrending();
  }, [fetchSubscriptions, fetchTrending]);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch<{ feeds: PodcastFeed[] }>(
        `/podcasts/search?q=${encodeURIComponent(query)}`
      );
      setResults(data.feeds || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  const displayList = results.length > 0 ? results : trending;
  const listTitle = results.length > 0 ? "Search Results" : "Trending";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search podcasts..."
          className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-4 py-2 bg-white text-zinc-950 text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {searching ? "..." : "Search"}
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">{listTitle}</h2>
        <div className="space-y-2">
          {displayList.map((feed) => (
            <PodcastCard
              key={feed.id}
              id={String(feed.id)}
              title={feed.title}
              author={feed.author}
              description={feed.description}
              imageUrl={feed.image}
              feedUrl={feed.url}
              isSubscribed={subscribedIds.has(String(feed.id))}
              onToggle={fetchSubscriptions}
            />
          ))}
        </div>
        {displayList.length === 0 && !searching && (
          <p className="text-zinc-500 text-sm text-center py-8">
            {results.length === 0 && query ? "No results found." : "Loading..."}
          </p>
        )}
      </div>
    </div>
  );
}
