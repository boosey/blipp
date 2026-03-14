import { useState, useEffect, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useApiFetch } from "../lib/api";
import { useFetch } from "../lib/use-fetch";
import { PodcastCard } from "../components/podcast-card";
import { DiscoverSkeleton } from "../components/skeletons/discover-skeleton";
import { EmptyState } from "../components/empty-state";

interface CatalogPodcast {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  episodeCount: number;
  categories: string[];
}

const CATEGORIES = [
  "All", "News", "Technology", "Business", "Comedy",
  "Science", "Sports", "Culture", "Health", "Education", "True Crime",
] as const;

export function Discover() {
  const apiFetch = useApiFetch();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogPodcast[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const { data: subsData, refetch: refetchSubscriptions } = useFetch<{
    subscriptions: { podcastId: string }[];
  }>("/podcasts/subscriptions");
  const subscribedIds = new Set(subsData?.subscriptions.map((s) => s.podcastId) ?? []);

  const { data: catalogData, error: catalogError } = useFetch<{
    podcasts: CatalogPodcast[];
  }>("/podcasts/catalog");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fire search when debounced value changes
  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    setSearching(true);
    setSearchError(null);

    apiFetch<{ podcasts: CatalogPodcast[] }>(
      `/podcasts/catalog?q=${encodeURIComponent(q)}`
    )
      .then((data) => {
        if (!cancelled) setSearchResults(data.podcasts || []);
      })
      .catch((e) => {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError(e instanceof Error ? e.message : "Search failed");
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => { cancelled = true; };
  }, [debouncedSearch, apiFetch]);

  function handleClearSearch() {
    setSearchInput("");
    setDebouncedSearch("");
    setSearchResults(null);
    setSearchError(null);
  }

  const isSearching = searchInput.trim().length > 0;

  // Trending: top 10 by episode count
  const trendingPodcasts = useMemo(() => {
    if (!catalogData?.podcasts) return [];
    return [...catalogData.podcasts]
      .sort((a, b) => b.episodeCount - a.episodeCount)
      .slice(0, 10);
  }, [catalogData?.podcasts]);

  // Browse list filtered by category
  const browsePodcasts = useMemo(() => {
    if (!catalogData?.podcasts) return [];
    if (selectedCategory === "All") return catalogData.podcasts;
    return catalogData.podcasts.filter((p) =>
      p.categories?.some(
        (c) => c.toLowerCase() === selectedCategory.toLowerCase()
      )
    );
  }, [catalogData?.podcasts, selectedCategory]);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search podcasts..."
          className="w-full pl-10 pr-10 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
        />
        {searchInput && (
          <button
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
          </button>
        )}
      </div>

      {isSearching ? (
        /* Search results mode */
        <div>
          <h2 className="text-lg font-semibold mb-3">Search Results</h2>
          {searching && <DiscoverSkeleton />}
          {!searching && searchError && (
            <p className="text-red-400 text-sm text-center py-4">{searchError}</p>
          )}
          {!searching && !searchError && searchResults && searchResults.length === 0 && (
            <EmptyState
              icon={Search}
              title="No podcasts found"
              description="Try a different search term or browse our catalog."
            />
          )}
          {!searching && searchResults && searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((podcast) => (
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
          )}
        </div>
      ) : (
        /* Browse mode */
        <>
          {/* Category pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide mt-4">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? "bg-white text-zinc-950"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Trending section */}
          {trendingPodcasts.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-semibold mb-3">Trending Now</h2>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {trendingPodcasts.map((podcast) => (
                  <Link
                    to={`/discover/${podcast.id}`}
                    key={podcast.id}
                    className="flex-shrink-0 w-28"
                  >
                    {podcast.imageUrl ? (
                      <img
                        src={podcast.imageUrl}
                        className="w-28 h-28 rounded-lg object-cover"
                        alt=""
                      />
                    ) : (
                      <div className="w-28 h-28 rounded-lg bg-zinc-800 flex items-center justify-center">
                        <span className="text-2xl font-bold text-zinc-500">
                          {podcast.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <p className="text-xs font-medium mt-1.5 truncate">
                      {podcast.title}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Browse All */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Browse All</h2>
            {catalogError && (
              <p className="text-red-400 text-sm text-center py-4">{catalogError}</p>
            )}
            {!catalogData && !catalogError && <DiscoverSkeleton />}
            {browsePodcasts.length > 0 && (
              <div className="space-y-2">
                {browsePodcasts.map((podcast) => (
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
            )}
            {catalogData && browsePodcasts.length === 0 && (
              <EmptyState
                icon={Search}
                title="No podcasts in this category"
                description="Try selecting a different category."
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
