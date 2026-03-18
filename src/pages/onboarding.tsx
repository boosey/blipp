import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApiFetch } from "../lib/api";
import { useFetch } from "../lib/use-fetch";
import { useOnboarding } from "../contexts/onboarding-context";
import { Check, ChevronRight, Headphones, Search, X } from "lucide-react";

interface CatalogPodcast {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  categories: string[];
  episodeCount: number;
}

const CATEGORIES = [
  "All", "News", "Technology", "Business", "Comedy",
  "Science", "Sports", "Culture", "Health", "Education", "True Crime",
] as const;

export default function Onboarding() {
  const navigate = useNavigate();
  const apiFetch = useApiFetch();
  const { markComplete } = useOnboarding();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedPodcasts, setSelectedPodcasts] = useState<Set<string>>(
    new Set()
  );
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogPodcast[] | null>(null);
  const [searching, setSearching] = useState(false);

  const { data: catalogData, loading: catalogLoading } = useFetch<{
    podcasts: CatalogPodcast[];
  }>("/podcasts/catalog?pageSize=100", { enabled: step === 2 });

  const podcasts = catalogData?.podcasts ?? [];

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
      return;
    }

    let cancelled = false;
    setSearching(true);

    apiFetch<{ podcasts: CatalogPodcast[] }>(
      `/podcasts/catalog?q=${encodeURIComponent(q)}`
    )
      .then((data) => {
        if (!cancelled) setSearchResults(data.podcasts || []);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => { cancelled = true; };
  }, [debouncedSearch, apiFetch]);

  const isSearching = searchInput.trim().length > 0;

  const filteredPodcasts = useMemo(() => {
    const source = isSearching ? (searchResults ?? []) : podcasts;
    if (categoryFilter === "All") return source;
    return source.filter((p) =>
      p.categories?.some(
        (c) => c.toLowerCase() === categoryFilter.toLowerCase()
      )
    );
  }, [isSearching, searchResults, podcasts, categoryFilter]);

  function togglePodcast(id: string) {
    setSelectedPodcasts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleFinish() {
    setSaving(true);

    // Save favorites (if any selected)
    if (selectedPodcasts.size > 0) {
      try {
        await apiFetch("/podcasts/favorites", {
          method: "POST",
          body: JSON.stringify({ podcastIds: Array.from(selectedPodcasts) }),
        });
      } catch {
        // Non-critical — don't block onboarding completion
      }
    }

    // Mark onboarding complete in DB + local state
    try {
      await apiFetch("/me/onboarding-complete", { method: "PATCH" });
    } catch {
      // Non-critical
    }
    markComplete();

    setStep(3);
    setSaving(false);
  }

  // Step 1 — Welcome
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6">
        <div className="max-w-sm text-center space-y-6">
          <div className="w-16 h-16 mx-auto bg-foreground/10 rounded-2xl flex items-center justify-center">
            <Headphones className="w-8 h-8 text-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Your podcasts, distilled.</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Blipp turns hour-long podcast episodes into short audio briefings
            you can listen to in minutes.
          </p>
          <button
            onClick={() => setStep(2)}
            className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            Get Started
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Step 2 — Pick favorites (optional)
  if (step === 2) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col px-4 py-6">
        <div className="space-y-4 flex-1">
          <div>
            <h1 className="text-xl font-bold">
              What podcasts are you into?
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Pick a few so we can tailor your experience.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search podcasts..."
              className="w-full pl-10 pr-10 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-muted-foreground"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput("");
                  setDebouncedSearch("");
                  setSearchResults(null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground/70" />
              </button>
            )}
          </div>

          {/* Category filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x-mandatory">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 snap-start ${
                  categoryFilter === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground/70 hover:bg-accent"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Podcast grid */}
          {catalogLoading || searching ? (
            <div className="text-muted-foreground text-sm text-center py-12">
              {searching ? "Searching..." : "Loading podcasts..."}
            </div>
          ) : filteredPodcasts.length === 0 && isSearching ? (
            <div className="text-muted-foreground text-sm text-center py-12">
              No podcasts found. Try a different search.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {filteredPodcasts.map((podcast) => {
                const isSelected = selectedPodcasts.has(podcast.id);
                return (
                  <button
                    key={podcast.id}
                    onClick={() => togglePodcast(podcast.id)}
                    className="relative text-left"
                  >
                    <div
                      className={`rounded-xl overflow-hidden border-2 transition-colors ${
                        isSelected
                          ? "border-foreground"
                          : "border-transparent"
                      }`}
                    >
                      {podcast.imageUrl ? (
                        <img
                          src={podcast.imageUrl}
                          alt={podcast.title}
                          className="w-full aspect-square object-cover bg-muted"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-muted flex items-center justify-center">
                          <span className="text-2xl font-bold text-muted-foreground">
                            {podcast.title.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-medium mt-1.5 line-clamp-2 leading-tight">
                      {podcast.title}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="sticky bottom-0 pt-4 pb-2 bg-background space-y-2">
          <button
            onClick={handleFinish}
            disabled={saving}
            className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving
              ? "Saving..."
              : selectedPodcasts.size > 0
                ? `Continue with ${selectedPodcasts.size} favorite${selectedPodcasts.size > 1 ? "s" : ""}`
                : "Continue"}
            {!saving && <ChevronRight className="w-4 h-4" />}
          </button>
          <button
            onClick={async () => {
              try {
                await apiFetch("/me/onboarding-complete", { method: "PATCH" });
              } catch {
                // Non-critical
              }
              markComplete();
              navigate("/home");
            }}
            className="w-full py-2 text-muted-foreground text-sm hover:text-foreground/70 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // Step 3 — Confirmation
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6">
      <div className="max-w-sm text-center space-y-6">
        <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
          <Check className="w-8 h-8 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold">You're all set!</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {selectedPodcasts.size > 0
            ? "We've saved your favorites. Explore the catalog to subscribe and start getting briefings."
            : "Browse our catalog to find podcasts and start getting briefings."}
        </p>
        <button
          onClick={() => navigate("/home")}
          className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors"
        >
          Go to Feed
        </button>
      </div>
    </div>
  );
}
