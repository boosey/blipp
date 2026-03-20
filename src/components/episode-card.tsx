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
  reason?: string;
  variant?: "compact" | "full";
}

function formatDuration(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  const days = Math.floor(d / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function EpisodeCard({ episode, podcast, reason, variant = "full" }: EpisodeCardProps) {
  const { open } = usePodcastSheet();
  const duration = formatDuration(episode.durationSeconds);
  const date = relativeDate(episode.publishedAt);

  if (variant === "compact") {
    return (
      <button
        onClick={() => open(podcast.id)}
        className="w-[180px] flex-shrink-0 snap-start bg-card border border-border rounded-lg overflow-hidden text-left active:scale-[0.98] transition-transform duration-75"
      >
        {podcast.imageUrl ? (
          <img
            src={podcast.imageUrl}
            alt=""
            className="w-full h-24 object-cover"
          />
        ) : (
          <div className="w-full h-24 bg-muted flex items-center justify-center">
            <span className="text-2xl font-bold text-muted-foreground">
              {podcast.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="p-2.5 space-y-1">
          <p className="font-medium text-sm line-clamp-2 leading-tight">{episode.title}</p>
          <p className="text-xs text-muted-foreground truncate">{podcast.title}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
            {duration && <span>{duration}</span>}
            {duration && date && <span>·</span>}
            <span>{date}</span>
          </div>
          {reason && (
            <span className="inline-block text-[10px] text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full truncate max-w-full">
              {reason}
            </span>
          )}
        </div>
      </button>
    );
  }

  // Full variant — horizontal layout
  return (
    <button
      onClick={() => open(podcast.id)}
      className="w-full flex gap-3 bg-card border border-border rounded-lg p-3 text-left active:scale-[0.98] transition-transform duration-75"
    >
      {podcast.imageUrl ? (
        <img
          src={podcast.imageUrl}
          alt=""
          className="w-14 h-14 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-14 h-14 rounded bg-muted flex items-center justify-center flex-shrink-0">
          <span className="text-xl font-bold text-muted-foreground">
            {podcast.title.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground truncate">{podcast.title}</p>
          <span className="text-[10px] text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
            Suggested
          </span>
        </div>
        <p className="font-medium text-sm truncate mt-0.5">{episode.title}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
          {duration && <span>{duration}</span>}
          {duration && date && <span className="text-muted-foreground/60">·</span>}
          <span>{date}</span>
        </div>
        {reason && (
          <p className="text-[10px] text-muted-foreground/70 mt-1 truncate">{reason}</p>
        )}
      </div>
    </button>
  );
}
