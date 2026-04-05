import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Search, X, Plus, Loader2, ArrowUpDown, MapPin, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useApiFetch } from "../lib/api";
import { useFetch } from "../lib/use-fetch";
import { PodcastCard } from "../components/podcast-card";
import { ScrollableRow } from "../components/scrollable-row";
import { CuratedRow } from "../components/curated-row";
import { EpisodeCard } from "../components/episode-card";
import { DiscoverSkeleton } from "../components/skeletons/discover-skeleton";
import { EmptyState } from "../components/empty-state";
import { usePullToRefresh } from "../hooks/use-pull-to-refresh";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../components/ui/accordion";
import type { CuratedResponse, EpisodeBrowseItem, EpisodeBrowseResponse } from "../types/recommendations";

interface UserPrefs {
  preferredCategories: string[];
}

interface CatalogPodcast {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  episodeCount: number;
  subscriberCount: number;
  categories: string[];
}

interface CatalogResponse {
  podcasts: CatalogPodcast[];
  total: number;
  page: number;
  pageSize: number;
}

const BROWSE_PAGE_SIZE = 50;
const EPISODE_PAGE_SIZE = 20;

export function Discover() {
  const apiFetch = useApiFetch();
  const { open: openPodcast } = usePodcastSheet();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogPodcast[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [browseTab, setBrowseTab] = useState<"episodes" | "podcasts">("podcasts");
  const [sortBy, setSortBy] = useState<"rank" | "popularity" | "subscriptions" | "favorites">("rank");
  const [showSortMenu, setShowSortMenu] = useState(false);

  // User preferences for pill ordering
  const { data: meData } = useFetch<{ user: UserPrefs }>("/me");
  const preferredCategories = meData?.user?.preferredCategories ?? [];

  // Dynamic category pills from API
  const { data: categoryData } = useFetch<{
    categories: { id: string; name: string; podcastCount: number }[];
  }>("/podcasts/categories");

  const categoryNames = useMemo(() => {
    if (!categoryData?.categories) return ["All"];
    const unique = [...new Set(categoryData.categories.map((c) => c.name))];
    // Put user's preferred categories first
    const prefSet = new Set(preferredCategories);
    const preferred = unique.filter((c) => prefSet.has(c));
    const rest = unique.filter((c) => !prefSet.has(c));
    return ["All", ...preferred, ...rest];
  }, [categoryData?.categories, preferredCategories]);

  // Reset selection if selected category disappears from the list
  useEffect(() => {
    if (selectedCategory !== "All" && !categoryNames.includes(selectedCategory)) {
      setSelectedCategory("All");
    }
  }, [categoryNames, selectedCategory]);

  // Podcast request form
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestQuery, setRequestQuery] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [myRequests, setMyRequests] = useState<
    { id: string; feedUrl: string; title?: string; status: string; podcastId?: string }[]
  >([]);

  // --- Curated rows ---
  const curatedEndpoint = selectedCategory !== "All"
    ? `/recommendations/curated?genre=${encodeURIComponent(selectedCategory)}&explicit=true`
    : "/recommendations/curated";
  const { data: curatedData, loading: curatedLoading } = useFetch<CuratedResponse>(curatedEndpoint);

  // --- Local discovery ---
  const { data: localData } = useFetch<{
    data: {
      local: { podcast: { id: string; title: string; imageUrl: string | null; author: string | null; categories: string[] }; scope: string; confidence: number }[];
      localSports: { podcast: { id: string; title: string; imageUrl: string | null; author: string | null; categories: string[] }; scope: string; confidence: number; team: { id: string; name: string; nickname: string; abbreviation: string } }[];
      dmaCode: string | null;
    };
  }>("/recommendations/local");

  // --- Episodes browse with pagination ---
  const [episodes, setEpisodes] = useState<EpisodeBrowseItem[]>([]);
  const [episodeTotal, setEpisodeTotal] = useState(0);
  const [episodePage, setEpisodePage] = useState(1);
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [episodeInitialLoaded, setEpisodeInitialLoaded] = useState(false);
  const episodeLoadMoreRef = useRef<HTMLDivElement>(null);

  const fetchEpisodePage = useCallback(async (page: number, reset = false) => {
    setEpisodeLoading(true);
    try {
      const genreParam = selectedCategory !== "All" ? `&genre=${encodeURIComponent(selectedCategory)}&explicit=true` : "";
      const searchParam = debouncedSearch.trim() ? `&search=${encodeURIComponent(debouncedSearch.trim())}` : "";
      const sortParam = `&sort=${sortBy}`;
      const data = await apiFetch<EpisodeBrowseResponse>(
        `/recommendations/episodes?page=${page}&pageSize=${EPISODE_PAGE_SIZE}${genreParam}${searchParam}${sortParam}`
      );
      setEpisodes((prev) => reset ? data.episodes : [...prev, ...data.episodes]);
      setEpisodeTotal(data.total);
      setEpisodePage(page);
      setEpisodeInitialLoaded(true);
    } catch {
      // Silently fail — curated rows are the primary content
    } finally {
      setEpisodeLoading(false);
    }
  }, [apiFetch, selectedCategory, debouncedSearch, sortBy]);

  // Reset episodes when category, search, or sort changes
  useEffect(() => {
    setEpisodes([]);
    setEpisodePage(1);
    setEpisodeInitialLoaded(false);
    fetchEpisodePage(1, true);
  }, [fetchEpisodePage]);

  const episodeHasMore = episodes.length < episodeTotal;

  const episodeStateRef = useRef({ episodeHasMore, episodeLoading, episodePage, fetchEpisodePage });
  episodeStateRef.current = { episodeHasMore, episodeLoading, episodePage, fetchEpisodePage };

  // Intersection observer for episode infinite scroll
  useEffect(() => {
    const el = episodeLoadMoreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const { episodeHasMore: hm, episodeLoading: ld, episodePage: pg, fetchEpisodePage: loadPage } = episodeStateRef.current;
        if (entries[0].isIntersecting && hm && !ld) {
          loadPage(pg + 1);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- Podcasts browse with pagination ---
  const [allPodcasts, setAllPodcasts] = useState<CatalogPodcast[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const fetchCatalogPage = useCallback(async (page: number, reset = false) => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const genreParam = selectedCategory !== "All" ? `&category=${encodeURIComponent(selectedCategory)}&explicit=true` : "";
      const searchParam = debouncedSearch.trim() ? `&q=${encodeURIComponent(debouncedSearch.trim())}` : "";
      const sortParam = `&sort=${sortBy}`;
      const data = await apiFetch<CatalogResponse>(
        `/podcasts/catalog?page=${page}&pageSize=${BROWSE_PAGE_SIZE}${genreParam}${searchParam}${sortParam}`
      );
      setAllPodcasts((prev) => reset ? data.podcasts : [...prev, ...data.podcasts]);
      setBrowseTotal(data.total);
      setBrowsePage(page);
      setInitialLoaded(true);
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : "Failed to load catalog");
    } finally {
      setBrowseLoading(false);
    }
  }, [apiFetch, selectedCategory, debouncedSearch, sortBy]);

  // Reset podcasts browse when category, search, or sort changes
  useEffect(() => {
    setAllPodcasts([]);
    setBrowsePage(1);
    setInitialLoaded(false);
    fetchCatalogPage(1, true);
  }, [fetchCatalogPage]);

  const hasMore = allPodcasts.length < browseTotal;

  const browseStateRef = useRef({ hasMore, browseLoading, browsePage, fetchCatalogPage });
  browseStateRef.current = { hasMore, browseLoading, browsePage, fetchCatalogPage };

  // Intersection observer for podcast infinite scroll
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const { hasMore: hm, browseLoading: bl, browsePage: bp, fetchCatalogPage: loadPage } = browseStateRef.current;
        if (entries[0].isIntersecting && hm && !bl) {
          loadPage(bp + 1);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Pull to refresh
  const { indicator: pullIndicator, bind: pullBind } = usePullToRefresh({
    onRefresh: async () => {
      if (browseTab === "episodes") {
        await fetchEpisodePage(1, true);
      } else {
        await fetchCatalogPage(1, true);
      }
    },
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Legacy search for search-results mode (podcast search when typing)
  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    // Search results now handled via browse tabs (episodes + podcasts filtered by search)
    // Clear the legacy search overlay
    setSearchResults(null);
    setSearchError(null);
  }, [debouncedSearch]);

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
    if (!requestQuery.trim()) return;
    setRequestLoading(true);
    try {
      await apiFetch("/podcasts/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: requestQuery.trim() }),
      });
      toast.success("Podcast request submitted! We'll review it soon.");
      setRequestQuery("");
      setShowRequestForm(false);
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

  return (
    <div className="space-y-4" {...pullBind}>
      {pullIndicator}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search episodes & podcasts..."
          className="w-full pl-10 pr-10 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-muted-foreground"
        />
        {searchInput && (
          <button
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Category pills */}
      <ScrollableRow className="gap-2 pb-2">
        {categoryNames.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors snap-start flex-shrink-0 ${
              selectedCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {cat}
          </button>
        ))}
      </ScrollableRow>

      {/* Local discovery sections */}
      {localData?.data?.dmaCode && (localData.data.local.length > 0 || localData.data.localSports.length > 0) && (
        <Accordion type="multiple" defaultValue={["local", "local-sports"]}>
          {localData.data.local.length > 0 && (
            <AccordionItem value="local">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Local Podcasts
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {localData.data.local.map((item) => (
                    <button
                      key={item.podcast.id}
                      onClick={() => openPodcast(item.podcast.id)}
                      className="text-left"
                    >
                      {item.podcast.imageUrl ? (
                        <img
                          src={item.podcast.imageUrl}
                          className="w-full aspect-square rounded-lg object-cover"
                          alt=""
                        />
                      ) : (
                        <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center">
                          <span className="text-2xl font-bold text-muted-foreground">
                            {item.podcast.title.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <p className="text-xs font-medium mt-1.5 truncate">{item.podcast.title}</p>
                    </button>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {localData.data.localSports.length > 0 && (
            <AccordionItem value="local-sports">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  Local Sports
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {localData.data.localSports.map((item) => (
                    <button
                      key={item.podcast.id}
                      onClick={() => openPodcast(item.podcast.id)}
                      className="text-left"
                    >
                      {item.podcast.imageUrl ? (
                        <img
                          src={item.podcast.imageUrl}
                          className="w-full aspect-square rounded-lg object-cover"
                          alt=""
                        />
                      ) : (
                        <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center">
                          <span className="text-2xl font-bold text-muted-foreground">
                            {item.podcast.title.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <p className="text-xs font-medium mt-1.5 truncate">{item.podcast.title}</p>
                      {item.team?.nickname && (
                        <span className="text-[10px] text-muted-foreground truncate block">
                          {item.team.nickname}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}

      {/* Curated rows — smoothly hidden when searching */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          debouncedSearch.trim()
            ? "max-h-0 opacity-0"
            : "max-h-[2000px] opacity-100"
        }`}
      >
          {curatedLoading && !curatedData && (
            <div className="space-y-6">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-40 bg-muted rounded animate-pulse" />
                  <div className="flex gap-3 overflow-hidden">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="w-[180px] h-[180px] bg-muted rounded-lg animate-pulse flex-shrink-0" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {curatedData?.rows.map((row, i) => (
            <CuratedRow key={`${row.title}-${i}`} row={row} />
          ))}

          {/* Podcast suggestions from curated */}
          {curatedData?.podcastSuggestions && curatedData.podcastSuggestions.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">You might want to subscribe</h2>
              <ScrollableRow className="gap-3 pb-2">
                {curatedData.podcastSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.podcast.id}
                    onClick={() => openPodcast(suggestion.podcast.id)}
                    className="flex-shrink-0 w-28 snap-start text-left"
                  >
                    {suggestion.podcast.imageUrl ? (
                      <img
                        src={suggestion.podcast.imageUrl}
                        className="w-28 h-28 rounded-lg object-cover"
                        alt=""
                      />
                    ) : (
                      <div className="w-28 h-28 rounded-lg bg-muted flex items-center justify-center">
                        <span className="text-2xl font-bold text-muted-foreground">
                          {suggestion.podcast.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <p className="text-xs font-medium mt-1.5 truncate">{suggestion.podcast.title}</p>
                    {suggestion.topReasons[0] && (
                      <span className="text-[10px] text-muted-foreground truncate block">
                        {suggestion.topReasons[0]}
                      </span>
                    )}
                  </button>
                ))}
              </ScrollableRow>
            </section>
          )}
      </div>

      {/* Tab switcher: Podcasts / Episodes + Sort */}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={() => setBrowseTab("podcasts")}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
            browseTab === "podcasts"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Podcasts
        </button>
        <button
          onClick={() => setBrowseTab("episodes")}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
            browseTab === "episodes"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Episodes
        </button>
        <div className="relative ml-auto">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className={`p-2 rounded-lg transition-colors ${
              showSortMenu ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Sort"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
          {showSortMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-50 bg-card/90 backdrop-blur-md border border-border rounded-lg py-1 shadow-xl shadow-black/40 min-w-[160px]">
                {([
                  { value: "rank", label: "Apple Rank" },
                  { value: "popularity", label: "Popularity" },
                  { value: "subscriptions", label: "Subscriptions" },
                  { value: "favorites", label: "Favorites" },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => { setSortBy(value); setShowSortMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      sortBy === value
                        ? "text-primary font-medium"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Episodes tab */}
      {browseTab === "episodes" && (
        <section>
          {!episodeInitialLoaded && episodeLoading && <DiscoverSkeleton />}
          {episodeInitialLoaded && episodes.length === 0 && (
            <EmptyState
              icon={Search}
              title="No episodes found"
              description={debouncedSearch.trim() ? "Try a different search term." : "Try selecting a different category."}
            />
          )}
          {episodes.length > 0 && (
            <div className="space-y-2">
              {episodes.map((item) => (
                <EpisodeCard
                  key={item.episode.id}
                  episode={item.episode}
                  podcast={item.podcast}
                  variant="full"
                />
              ))}
            </div>
          )}
          <div ref={episodeLoadMoreRef} className="h-1" />
          {episodeLoading && episodeInitialLoaded && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {episodeHasMore && !episodeLoading && episodeInitialLoaded && (
            <button
              onClick={() => fetchEpisodePage(episodePage + 1)}
              className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Load more
            </button>
          )}
        </section>
      )}

      {/* Podcasts tab */}
      {browseTab === "podcasts" && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            {browseTotal > 0 && (
              <span className="text-xs text-muted-foreground">{browseTotal} podcasts</span>
            )}
          </div>
          {browseError && (
            <p className="text-red-400 text-sm text-center py-4">{browseError}</p>
          )}
          {!initialLoaded && !browseError && <DiscoverSkeleton />}
          {allPodcasts.length > 0 && (
            <div className="space-y-2">
              {allPodcasts.map((podcast) => (
                <PodcastCard
                  key={podcast.id}
                  id={podcast.id}
                  title={podcast.title}
                  author={podcast.author || ""}
                  description={podcast.description || ""}
                  imageUrl={podcast.imageUrl || ""}
                  episodeCount={podcast.episodeCount}
                  subscriberCount={podcast.subscriberCount}
                />
              ))}
            </div>
          )}
          {initialLoaded && allPodcasts.length === 0 && (
            <EmptyState
              icon={Search}
              title="No podcasts found"
              description={debouncedSearch.trim() ? "Try a different search term." : "Try selecting a different category."}
            />
          )}
          <div ref={loadMoreRef} className="h-1" />
          {browseLoading && initialLoaded && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {hasMore && !browseLoading && initialLoaded && (
            <button
              onClick={() => fetchCatalogPage(browsePage + 1)}
              className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Load more
            </button>
          )}
        </section>
      )}

      {/* Request a Podcast */}
      <div className="mt-6">
        {!showRequestForm ? (
          <button
            onClick={() => setShowRequestForm(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Can't find a podcast? Request it
          </button>
        ) : (
          <div className="bg-card border border-border rounded-lg p-3 space-y-2">
            <p className="text-xs text-muted-foreground">What podcast are you looking for?</p>
            <div className="flex gap-2">
              <input
                value={requestQuery}
                onChange={(e) => setRequestQuery(e.target.value)}
                placeholder="e.g. The Daily, Huberman Lab"
                className="flex-1 px-3 py-1.5 bg-muted border border-border rounded text-sm"
              />
              <button
                onClick={handlePodcastRequest}
                disabled={requestLoading || !requestQuery.trim()}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded disabled:opacity-50"
              >
                {requestLoading ? "..." : "Request"}
              </button>
            </div>
            <button
              onClick={() => { setShowRequestForm(false); setRequestQuery(""); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* My Requests */}
      {myRequests.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">My Requests</h3>
          <div className="space-y-1.5">
            {myRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">{req.title || req.feedUrl}</p>
                  <p className="text-xs text-muted-foreground">{req.status.toLowerCase()}</p>
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
                    className="text-xs text-muted-foreground hover:text-red-400 ml-2"
                  >
                    Cancel
                  </button>
                )}
                {req.status === "APPROVED" && req.podcastId && (
                  <button onClick={() => openPodcast(req.podcastId!)} className="text-xs text-foreground ml-2">
                    Subscribe &rarr;
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
