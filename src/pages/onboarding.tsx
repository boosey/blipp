import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApiFetch } from "../lib/api";
import { useFetch } from "../lib/use-fetch";
import { Check, ChevronRight, Headphones, Zap, BookOpen } from "lucide-react";

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

type Step = 1 | 2 | 3 | 4;
type DurationPreference = "quick" | "standard" | "deep";

const DURATION_MAP: Record<DurationPreference, number> = {
  quick: 3,
  standard: 5,
  deep: 10,
};

export default function Onboarding() {
  const navigate = useNavigate();
  const apiFetch = useApiFetch();
  const [step, setStep] = useState<Step>(1);
  const [selectedPodcasts, setSelectedPodcasts] = useState<Set<string>>(
    new Set()
  );
  const [durationPreference, setDurationPreference] =
    useState<DurationPreference>("standard");
  const [subscribing, setSubscribing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("All");

  const { data: catalogData, loading: catalogLoading } = useFetch<{
    podcasts: CatalogPodcast[];
  }>("/podcasts/catalog?pageSize=100", { enabled: step === 2 });

  const podcasts = catalogData?.podcasts ?? [];

  // Extract unique categories from catalog
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
    setSubscribing(true);
    const durationTier = DURATION_MAP[durationPreference];
    const selectedList = podcasts.filter((p) => selectedPodcasts.has(p.id));

    await Promise.allSettled(
      selectedList.map((podcast) =>
        apiFetch("/podcasts/subscribe", {
          method: "POST",
          body: JSON.stringify({
            feedUrl: podcast.feedUrl,
            title: podcast.title,
            description: podcast.description,
            imageUrl: podcast.imageUrl,
            author: podcast.author,
            durationTier,
          }),
        })
      )
    );

    localStorage.setItem("blipp:onboarding-complete", "true");
    setStep(4);
    setSubscribing(false);
  }

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

  if (step === 2) {
    const canContinue = selectedPodcasts.size >= 3;

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col px-4 py-6">
        <div className="space-y-4 flex-1">
          <div>
            <h1 className="text-xl font-bold">Choose podcasts you follow</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {selectedPodcasts.size} of 3 minimum selected
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
            <div className="grid grid-cols-3 gap-3">
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
                      <img
                        src={podcast.imageUrl || ""}
                        alt={podcast.title}
                        className="w-full aspect-square object-cover bg-zinc-800"
                      />
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

        {/* Sticky continue button */}
        <div className="sticky bottom-0 pt-4 pb-2 bg-zinc-950">
          <button
            onClick={() => setStep(3)}
            disabled={!canContinue}
            className="w-full py-3 bg-white text-zinc-950 font-semibold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (step === 3) {
    const options: {
      key: DurationPreference;
      label: string;
      time: string;
      description: string;
      icon: typeof Zap;
    }[] = [
      {
        key: "quick",
        label: "Quick",
        time: "1-3 min",
        description: "Headlines and key points",
        icon: Zap,
      },
      {
        key: "standard",
        label: "Standard",
        time: "5-7 min",
        description: "Full story summaries",
        icon: Headphones,
      },
      {
        key: "deep",
        label: "Deep",
        time: "10-15 min",
        description: "Detailed analysis",
        icon: BookOpen,
      },
    ];

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center px-6">
        <div className="max-w-sm w-full space-y-6">
          <div>
            <h1 className="text-xl font-bold">
              How long should your briefings be?
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              You can change this later for each podcast.
            </p>
          </div>

          <div className="space-y-3">
            {options.map((opt) => {
              const isSelected = durationPreference === opt.key;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  onClick={() => setDurationPreference(opt.key)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors text-left ${
                    isSelected
                      ? "border-white bg-white/5"
                      : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isSelected ? "bg-white/20" : "bg-zinc-800"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{opt.label}</span>
                      <span className="text-xs text-zinc-400">{opt.time}</span>
                    </div>
                    <p className="text-sm text-zinc-400">{opt.description}</p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? "border-white" : "border-zinc-600"
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2.5 h-2.5 rounded-full bg-white" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleFinish}
            disabled={subscribing}
            className="w-full py-3 bg-white text-zinc-950 font-semibold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {subscribing ? "Setting up..." : "Continue"}
            {!subscribing && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  }

  // Step 4 — Confirmation
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center px-6">
      <div className="max-w-sm text-center space-y-6">
        <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
          <Check className="w-8 h-8 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold">You're all set!</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          We're creating your first briefings now. They'll appear in your feed
          shortly.
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
