import { useState, useEffect, useMemo } from "react";
import { Search, X, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
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

  // Podcast request form
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestUrl, setRequestUrl] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [myRequests, setMyRequests] = useState<
    { id: string; feedUrl: string; title?: string; status: string; podcastId?: string }[]
  >([]);

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

  // Fetch user's podcast requests
  useEffect(() => {
    apiFetch<{ data: typeof myRequests }>("/podcasts/requests")
      .then((data) => setMyRequests(data.data || []))
      .catch(() => {});
  }, [apiFetch]);

  async function handlePodcastRequest() {
    if (!requestUrl.trim()) return;
    setRequestLoading(true);
    try {
      await apiFetch("/podcasts/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: requestUrl.trim() }),
      });
      toast.success("Podcast request submitted! We'll review it soon.");
      setRequestUrl("");
      setShowRequestForm(false);
      // Refresh requests list
      apiFetch<{ data: typeof myRequests }>("/podcasts/requests")
        .then((data) => setMyRequests(data.data || []))
        .catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit request";
      if (message.includes("already")) {
        toast("This podcast is already in our catalog! You can subscribe directly.");
      } else {
        toast.error(message);
      }
    } finally {
      setRequestLoading(false);
    }
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

      {/* Request a Podcast */}
      {!isSearching && (
        <div className="mt-3">
          {!showRequestForm ? (
            <button
              onClick={() => setShowRequestForm(true)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Can't find a podcast? Request it
            </button>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
              <p className="text-xs text-zinc-400">Paste the podcast's RSS feed URL:</p>
              <div className="flex gap-2">
                <input
                  value={requestUrl}
                  onChange={(e) => setRequestUrl(e.target.value)}
                  placeholder="https://example.com/feed.xml"
                  className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
                />
                <button
                  onClick={handlePodcastRequest}
                  disabled={requestLoading || !requestUrl.trim()}
                  className="px-3 py-1.5 bg-white text-zinc-950 text-sm font-medium rounded disabled:opacity-50"
                >
                  {requestLoading ? "..." : "Submit"}
                </button>
              </div>
              <button
                onClick={() => { setShowRequestForm(false); setRequestUrl(""); }}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* My Requests */}
      {myRequests.length > 0 && !isSearching && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">My Requests</h3>
          <div className="space-y-1.5">
            {myRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">{req.title || req.feedUrl}</p>
                  <p className="text-xs text-zinc-500">{req.status.toLowerCase()}</p>
                </div>
                {req.status === "PENDING" && (
                  <button
                    onClick={async () => {
                      try {
                        await apiFetch(`/podcasts/request/${req.id}`, { method: "DELETE" });
                        setMyRequests((prev) => prev.filter((r) => r.id !== req.id));
                        toast.success("Request cancelled");
                      } catch {
                        toast.error("Failed to cancel request");
                      }
                    }}
                    className="text-xs text-zinc-500 hover:text-red-400 ml-2"
                  >
                    Cancel
                  </button>
                )}
                {req.status === "APPROVED" && req.podcastId && (
                  <Link to={`/discover/${req.podcastId}`} className="text-xs text-white ml-2">
                    Subscribe &rarr;
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
