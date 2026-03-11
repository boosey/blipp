import { Link } from "react-router-dom";
import type { FeedItem } from "../types/feed";

function statusLabel(status: FeedItem["status"]) {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return "Creating";
    case "READY":
      return "Ready";
    case "FAILED":
      return "Error";
  }
}

function statusColor(status: FeedItem["status"]) {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return "bg-yellow-500/20 text-yellow-400";
    case "READY":
      return "bg-green-500/20 text-green-400";
    case "FAILED":
      return "bg-red-500/20 text-red-400";
  }
}

export function FeedItemCard({
  item,
  onPlay,
}: {
  item: FeedItem;
  onPlay?: (id: string) => void;
}) {
  const isPlayable = item.status === "READY" && item.briefing?.clip;

  const card = (
    <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      {/* Unlistened dot */}
      <div className="w-2 flex-shrink-0">
        {!item.listened && item.status === "READY" && (
          <div className="w-2 h-2 rounded-full bg-blue-500" />
        )}
      </div>

      {/* Podcast artwork */}
      {item.podcast.imageUrl ? (
        <img
          src={item.podcast.imageUrl}
          alt=""
          className="w-12 h-12 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-zinc-800 flex-shrink-0" />
      )}

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.episode.title}</p>
        <p className="text-xs text-zinc-500 truncate">{item.podcast.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
            {item.durationTier}m
          </span>
          {item.episode.durationSeconds != null && (
            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
              {Math.round(item.episode.durationSeconds / 60)}m ep
            </span>
          )}
          <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
            {item.source === "SUBSCRIPTION" ? "Sub" : "On-demand"}
          </span>
        </div>
      </div>

      {/* Status */}
      <span
        className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor(item.status)}`}
      >
        {statusLabel(item.status)}
      </span>
    </div>
  );

  if (isPlayable) {
    return (
      <Link
        to={`/play/${item.id}`}
        onClick={() => onPlay?.(item.id)}
      >
        {card}
      </Link>
    );
  }

  return card;
}
