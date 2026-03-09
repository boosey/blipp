import { useState } from "react";
import { useApiFetch } from "../lib/api";
import { useFetch } from "../lib/use-fetch";
import { PodcastCard } from "../components/podcast-card";

interface CatalogPodcast {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  episodeCount: number;
}

export function Discover() {
  const apiFetch = useApiFetch();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogPodcast[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const { data: subsData, refetch: refetchSubscriptions } = useFetch<{
    subscriptions: { podcastId: string }[];
  }>("/podcasts/subscriptions");
  const subscribedIds = new Set(subsData?.subscriptions.map((s) => s.podcastId) ?? []);

  const { data: catalogData, error: catalogError } = useFetch<{
    podcasts: CatalogPodcast[];
  }>("/podcasts/catalog");

  async function handleSearch() {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      setSearchError(null);
      const data = await apiFetch<{ podcasts: CatalogPodcast[] }>(
        `/podcasts/catalog?q=${encodeURIComponent(q)}`
      );
      setSearchResults(data.podcasts || []);
    } catch (e) {
      setSearchResults([]);
      setSearchError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  function handleClearSearch() {
    setQuery("");
    setSearchResults(null);
    setSearchError(null);
  }

  const displayList = searchResults ?? catalogData?.podcasts ?? [];
  const listTitle = searchResults !== null ? "Search Results" : "Browse Catalog";

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
        {searchResults !== null && (
          <button
            onClick={handleClearSearch}
            className="px-3 py-2 bg-zinc-800 text-zinc-300 text-sm rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Clear
          </button>
        )}
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
          {displayList.map((podcast) => (
            <PodcastCard
              key={podcast.id}
              id={podcast.id}
              title={podcast.title}
              author={podcast.author || ""}
              description={podcast.description || ""}
              imageUrl={podcast.imageUrl || ""}
              feedUrl={podcast.feedUrl}
              isSubscribed={subscribedIds.has(podcast.id)}
              onToggle={refetchSubscriptions}
            />
          ))}
        </div>
        {(searchError || catalogError) && (
          <p className="text-red-400 text-sm text-center py-4">{searchError || catalogError}</p>
        )}
        {displayList.length === 0 && !searching && !searchError && !catalogError && (
          <p className="text-zinc-500 text-sm text-center py-8">
            {searchResults !== null ? "No results found." : "Loading..."}
          </p>
        )}
      </div>
    </div>
  );
}
