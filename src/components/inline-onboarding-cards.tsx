import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Loader2, Search } from "lucide-react";
import { useFetch } from "../lib/use-fetch";
import { ScrollableRow } from "./scrollable-row";

// ── Types ──

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

const TOPIC_CHIPS = [
  { emoji: "\u{1F4BB}", label: "Technology" },
  { emoji: "\u{1F4CA}", label: "Business" },
  { emoji: "\u{1F52C}", label: "Science" },
  { emoji: "\u{1F4F0}", label: "News" },
  { emoji: "\u{1F602}", label: "Comedy" },
  { emoji: "\u{1F4AA}", label: "Health" },
  { emoji: "\u{26BD}", label: "Sports" },
  { emoji: "\u{1F3A8}", label: "Arts" },
  { emoji: "\u{1F4DA}", label: "Education" },
  { emoji: "\u{1F50D}", label: "True Crime" },
  { emoji: "\u{1F30D}", label: "Culture" },
  { emoji: "\u{1F3B5}", label: "Music" },
];

// ── Topics Card ──

interface TopicsCardProps {
  onDone: (selectedCategories: string[]) => void;
  onSkip: () => void;
}

export function TopicsCard({ onDone, onSkip }: TopicsCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[15px] font-semibold">What are you into?</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tap a few — we'll find podcasts to match
          </p>
        </div>
        <button
          onClick={onSkip}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground px-2 py-1 rounded-md transition-colors"
        >
          Skip
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TOPIC_CHIPS.map((t) => (
          <button
            key={t.label}
            onClick={() => toggle(t.label)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-all duration-150 select-none active:scale-95 ${
              selected.has(t.label)
                ? "bg-primary text-primary-foreground ring-1 ring-primary/30"
                : "bg-muted text-foreground/70 hover:bg-accent border border-border"
            }`}
          >
            <span className="text-sm leading-none">{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <button
          onClick={() => onDone(Array.from(selected))}
          className="mt-3 w-full py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 transition-all animate-in fade-in slide-in-from-bottom-1 duration-200 flex items-center justify-center gap-1.5"
        >
          Show me podcasts
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ── Podcast Picker Card ──

interface PodcastPickerCardProps {
  preferredCategories: string[];
  onSubscribe: (podcasts: CatalogPodcast[]) => void;
  onSkip: () => void;
}

export function PodcastPickerCard({
  preferredCategories,
  onSubscribe,
  onSkip,
}: PodcastPickerCardProps) {
  const [selectedPodcasts, setSelectedPodcasts] = useState<
    Map<string, CatalogPodcast>
  >(new Map());

  const { data: catalogData, loading } = useFetch<{
    podcasts: CatalogPodcast[];
  }>("/podcasts/catalog?pageSize=50");

  const podcasts = catalogData?.podcasts ?? [];

  // Sort preferred categories to front
  const sortedPodcasts = useMemo(() => {
    if (preferredCategories.length === 0) return podcasts;
    const prefSet = new Set(
      preferredCategories.map((c) => c.toLowerCase())
    );
    return [...podcasts].sort((a, b) => {
      const aMatch = a.categories?.some((c) => prefSet.has(c.toLowerCase()))
        ? 1
        : 0;
      const bMatch = b.categories?.some((c) => prefSet.has(c.toLowerCase()))
        ? 1
        : 0;
      return bMatch - aMatch;
    });
  }, [podcasts, preferredCategories]);

  const count = selectedPodcasts.size;

  function toggle(podcast: CatalogPodcast) {
    setSelectedPodcasts((prev) => {
      const next = new Map(prev);
      if (next.has(podcast.id)) {
        next.delete(podcast.id);
      } else {
        next.set(podcast.id, podcast);
      }
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-[15px] font-semibold">Pick some to try</h3>
        <button
          onClick={onSkip}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground px-2 py-1 rounded-md transition-colors"
        >
          Later
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        We'll create your first briefings in minutes
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading podcasts...
        </div>
      ) : (
        <ScrollableRow className="gap-3 pb-1 -mx-5 px-5">
          {sortedPodcasts.map((podcast) => {
            const isSelected = selectedPodcasts.has(podcast.id);
            return (
              <button
                key={podcast.id}
                onClick={() => toggle(podcast)}
                className="flex-shrink-0 w-[100px] text-left active:scale-95 transition-transform"
              >
                <div
                  className={`w-[100px] h-[100px] rounded-[10px] overflow-hidden border-2 transition-all duration-200 relative ${
                    isSelected
                      ? "border-primary shadow-[0_0_16px_rgba(109,93,252,0.25)]"
                      : "border-transparent hover:border-border"
                  }`}
                >
                  {podcast.imageUrl ? (
                    <img
                      src={podcast.imageUrl}
                      alt={podcast.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <span className="text-2xl font-bold text-muted-foreground">
                        {podcast.title.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-[22px] h-[22px] bg-primary rounded-full flex items-center justify-center animate-in zoom-in duration-200">
                      <Check className="w-[13px] h-[13px] text-primary-foreground" />
                    </div>
                  )}
                </div>
                <p
                  className={`text-[11px] font-medium mt-1.5 line-clamp-2 leading-tight transition-colors ${
                    isSelected
                      ? "text-foreground"
                      : "text-foreground/70"
                  }`}
                >
                  {podcast.title}
                </p>
              </button>
            );
          })}
        </ScrollableRow>
      )}

      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-muted-foreground/60">
          {count > 0 ? (
            <>
              <span className="font-semibold text-muted-foreground">
                {count}
              </span>{" "}
              selected
            </>
          ) : (
            "\u00A0"
          )}
        </span>
        {count > 0 && (
          <button
            onClick={() => onSubscribe(Array.from(selectedPodcasts.values()))}
            className="px-5 py-2 bg-primary text-primary-foreground text-[13px] font-semibold rounded-lg hover:bg-primary/90 transition-all animate-in fade-in slide-in-from-bottom-1 duration-200"
          >
            Subscribe{count > 1 ? ` (${count})` : count === 1 ? " (1)" : ""}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Discover Nudge ──

export function DiscoverNudge({ text }: { text?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-5 mb-3">
      <p className="text-[13px] text-muted-foreground mb-3">
        {text ?? "Or browse our full catalog with 10,000+ podcasts"}
      </p>
      <Link
        to="/discover"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/15 transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        Explore Discover
      </Link>
    </div>
  );
}
