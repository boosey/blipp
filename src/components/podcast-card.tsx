import { useState } from "react";
import { ChevronRight, Heart, Lock } from "lucide-react";
import { useApiFetch } from "../lib/api";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";
import { ThumbButtons } from "./thumb-buttons";
import { useCanSubscribe } from "../contexts/plan-context";

export interface PodcastCardProps {
  id: string;
  title: string;
  author: string;
  description: string;
  imageUrl: string;
  episodeCount?: number;
  subscriberCount?: number;
}

export function PodcastCard({
  id,
  title,
  author,
  description,
  imageUrl,
  episodeCount,
  subscriberCount,
}: PodcastCardProps) {
  const { open } = usePodcastSheet();
  const apiFetch = useApiFetch();
  const { allowed: canSubscribe } = useCanSubscribe();
  const [vote, setVote] = useState(0);
  const [favorited, setFavorited] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Lazy-load vote + favorite state on first render
  if (!loaded) {
    setLoaded(true);
    Promise.all([
      apiFetch<{ podcast: { userVote: number } }>(`/podcasts/${id}`).catch(() => null),
      apiFetch<{ data: { id: string }[] }>("/podcasts/favorites").catch(() => null),
    ]).then(([podData, favData]) => {
      setVote(podData?.podcast?.userVote ?? 0);
      setFavorited(favData?.data?.some((f) => f.id === id) ?? false);
    });
  }

  async function handleVote(v: number) {
    const prev = vote;
    setVote(v);
    try {
      await apiFetch(`/podcasts/vote/${id}`, { method: "POST", body: JSON.stringify({ vote: v }) });
    } catch { setVote(prev); }
  }

  async function handleFavorite() {
    const prev = favorited;
    setFavorited(!prev);
    try {
      await apiFetch(`/podcasts/favorites/${id}`, { method: prev ? "DELETE" : "POST" });
    } catch { setFavorited(prev); }
  }

  return (
    <div className="flex gap-3 bg-card border border-border rounded-lg p-3 active:scale-[0.98] transition-transform duration-75">
      <button onClick={() => open(id)} className="flex gap-3 flex-1 min-w-0 text-left">
        <div className="relative flex-shrink-0">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              className="w-14 h-14 rounded object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded bg-muted flex items-center justify-center">
              <span className="text-xl font-bold text-muted-foreground">
                {title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {!canSubscribe && (
            <div className="absolute inset-0 rounded bg-background/60 flex items-center justify-center">
              <Lock className="w-4 h-4 text-amber-500" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{title}</h3>
          <p className="text-xs text-muted-foreground truncate">{author}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {description.replace(/<[^>]*>/g, "")}
          </p>
          {(episodeCount !== undefined || (subscriberCount !== undefined && subscriberCount > 0)) && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              {episodeCount !== undefined && <>{episodeCount} episodes</>}
              {episodeCount !== undefined && subscriberCount !== undefined && subscriberCount > 0 && " · "}
              {subscriberCount !== undefined && subscriberCount > 0 && <>{subscriberCount} {subscriberCount === 1 ? "subscriber" : "subscribers"}</>}
            </p>
          )}
        </div>
      </button>
      <div className="flex items-center gap-1 flex-shrink-0">
        <ThumbButtons vote={vote} onVote={handleVote} />
        <button
          onClick={(e) => { e.stopPropagation(); handleFavorite(); }}
          className="p-1 rounded-full hover:bg-muted transition-colors"
        >
          <Heart className={`w-3.5 h-3.5 transition-colors ${favorited ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
        </button>
      </div>
    </div>
  );
}
