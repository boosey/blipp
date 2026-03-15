import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApiFetch } from "../lib/api";
import { useFetch } from "../lib/use-fetch";
import { useOnboarding } from "../contexts/onboarding-context";
import { Check, ChevronRight, Headphones } from "lucide-react";

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

  const { data: catalogData, loading: catalogLoading } = useFetch<{
    podcasts: CatalogPodcast[];
  }>("/podcasts/catalog?pageSize=100", { enabled: step === 2 });

  const podcasts = catalogData?.podcasts ?? [];

  const allCategories = Array.from(
    new Set(podcasts.flatMap((p) => p.categories ?? []))
  ).sort();
  const categories = ["All", ...allCategories];

  const filteredPodcasts =
    categoryFilter === "All"
      ? podcasts
      : podcasts.filter((p) => p.categories?.includes(categoryFilter));

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
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center px-6">
        <div className="max-w-sm text-center space-y-6">
          <div className="w-16 h-16 mx-auto bg-white/10 rounded-2xl flex items-center justify-center">
            <Headphones className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Your podcasts, distilled.</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Blipp turns hour-long podcast episodes into short audio briefings
            you can listen to in minutes.
          </p>
          <button
            onClick={() => setStep(2)}
            className="w-full py-3 bg-white text-zinc-950 font-semibold rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
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
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col px-4 py-6">
        <div className="space-y-4 flex-1">
          <div>
            <h1 className="text-xl font-bold">
              What podcasts are you into?
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              Pick a few so we can tailor your experience. You can skip this.
            </p>
          </div>

          {/* Category filter pills */}
          {allCategories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                    categoryFilter === cat
                      ? "bg-white text-zinc-950"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Podcast grid */}
          {catalogLoading ? (
            <div className="text-zinc-500 text-sm text-center py-12">
              Loading podcasts...
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
                          ? "border-white"
                          : "border-transparent"
                      }`}
                    >
                      {podcast.imageUrl ? (
                        <img
                          src={podcast.imageUrl}
                          alt={podcast.title}
                          className="w-full aspect-square object-cover bg-zinc-800"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-zinc-800 flex items-center justify-center">
                          <span className="text-2xl font-bold text-zinc-500">
                            {podcast.title.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-zinc-950" />
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
        <div className="sticky bottom-0 pt-4 pb-2 bg-zinc-950 space-y-2">
          <button
            onClick={handleFinish}
            disabled={saving}
            className="w-full py-3 bg-white text-zinc-950 font-semibold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
            className="w-full py-2 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // Step 3 — Confirmation
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center px-6">
      <div className="max-w-sm text-center space-y-6">
        <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
          <Check className="w-8 h-8 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold">You're all set!</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          {selectedPodcasts.size > 0
            ? "We've saved your favorites. Explore the catalog to subscribe and start getting briefings."
            : "Browse our catalog to find podcasts and start getting briefings."}
        </p>
        <button
          onClick={() => navigate("/home")}
          className="w-full py-3 bg-white text-zinc-950 font-semibold rounded-xl hover:bg-zinc-200 transition-colors"
        >
          Go to Feed
        </button>
      </div>
    </div>
  );
}
