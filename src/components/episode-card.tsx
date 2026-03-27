import { usePodcastSheet } from "../contexts/podcast-sheet-context";

interface EpisodeCardProps {
  episode: {
    id: string;
    title: string;
    publishedAt: string | null;
    durationSeconds: number | null;
    topicTags: string[];
  };
  podcast: {
    id: string;
    title: string;
    author: string | null;
    imageUrl: string | null;
  };
  variant?: "compact" | "full";
}

export function EpisodeCard({ episode, podcast, variant = "full" }: EpisodeCardProps) {
  const { open } = usePodcastSheet();

  if (variant === "compact") {
    return (
      <button
        onClick={() => open(podcast.id, episode.id)}
        className="w-[140px] flex-shrink-0 snap-start bg-card border border-border rounded-lg overflow-hidden text-left active:scale-[0.98] transition-transform duration-75"
      >
        {podcast.imageUrl ? (
          <div className="w-full h-[140px] bg-muted">
            <img
              src={podcast.imageUrl}
              alt=""
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div className="w-full h-[140px] bg-muted flex items-center justify-center">
            <span className="text-2xl font-bold text-muted-foreground">
              {podcast.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="p-2 space-y-0.5">
          <p className="font-medium text-xs line-clamp-2 leading-tight">{episode.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{podcast.title}</p>
        </div>
      </button>
    );
  }

  // Full variant — horizontal layout
  return (
    <button
      onClick={() => open(podcast.id, episode.id)}
      className="w-full flex gap-3 bg-card border border-border rounded-lg p-3 text-left active:scale-[0.98] transition-transform duration-75"
    >
      {podcast.imageUrl ? (
        <div className="w-14 h-14 rounded bg-muted flex-shrink-0 overflow-hidden">
          <img
            src={podcast.imageUrl}
            alt=""
            className="w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="w-14 h-14 rounded bg-muted flex items-center justify-center flex-shrink-0">
          <span className="text-xl font-bold text-muted-foreground">
            {podcast.title.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{podcast.title}</p>
        <p className="font-medium text-sm truncate mt-0.5">{episode.title}</p>
      </div>
    </button>
  );
}
