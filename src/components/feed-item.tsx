import type { FeedItem } from "../types/feed";
import { useAudio } from "../contexts/audio-context";

/** Map raw pipeline error to a short user-facing message. */
function friendlyError(raw: string | null): string {
  if (!raw) return "Something went wrong";
  const l = raw.toLowerCase();
  if (l.includes("audio fetch failed") || l.includes("audio url") || l.includes("non-audio content") || l.includes("too small"))
    return "Episode audio unavailable";
  if (l.includes("no transcript") || l.includes("transcription")
    || l.includes("no narrative") || l.includes("narrative")
    || l.includes("no completed") || l.includes("no clips"))
    return "Blipp creation failed";
  if (l.includes("episode not found"))
    return "Episode no longer available";
  return "Something went wrong";
}

function statusLabel(status: FeedItem["status"]) {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return "Creating";
    case "FAILED":
      return "Error";
    default:
      return null;
  }
}

function statusColor(status: FeedItem["status"]) {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return "bg-yellow-500/20 text-yellow-400";
    case "FAILED":
      return "bg-red-500/20 text-red-400";
    default:
      return "";
  }
}

function formatEpDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m episode`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m episode` : `${h}h episode`;
}

export function FeedItemCard({
  item,
  onPlay,
}: {
  item: FeedItem;
  onPlay?: (id: string) => void;
}) {
  const audio = useAudio();
  const isPlayable = item.status === "READY" && item.briefing?.clip;
  const label = statusLabel(item.status);
  const epDuration = formatEpDuration(item.episode.durationSeconds);

  const card = (
    <div
      className={`relative flex gap-3 bg-card border border-border rounded-lg p-3 overflow-hidden${
        !item.listened && item.status === "READY"
          ? " border-l-[3px] border-l-blue-500"
          : ""
      }`}
    >
      {/* Podcast artwork */}
      {item.podcast.imageUrl ? (
        <img
          src={item.podcast.imageUrl}
          alt=""
          className="w-12 h-12 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-muted flex-shrink-0" />
      )}

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground truncate">{item.podcast.title}</p>
          {label && (
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor(item.status)}`}
            >
              {label}
            </span>
          )}
        </div>
        <p className="font-medium text-sm truncate mt-0.5">
          {item.episode.title}
        </p>
        {item.status === "FAILED" ? (
          <p className="text-[10px] text-red-400/80 mt-1 truncate">
            {friendlyError(item.errorMessage)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            {item.durationTier} min
            {epDuration && (
              <>
                <span className="text-muted-foreground/60 mx-1">·</span>
                <span className="text-muted-foreground/60">from {epDuration}</span>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );

  if (isPlayable) {
    return (
      <button
        className="w-full text-left active:scale-[0.98] transition-transform duration-75"
        onClick={() => {
          audio.play(item);
          onPlay?.(item.id);
        }}
      >
        {card}
      </button>
    );
  }

  return card;
}
