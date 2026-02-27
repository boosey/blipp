import { useState } from "react";
import { apiFetch } from "../lib/api";

/** Props for the PodcastCard component. */
export interface PodcastCardProps {
  id: string;
  title: string;
  author: string;
  description: string;
  imageUrl: string;
  isSubscribed: boolean;
  /** Called after a successful subscribe/unsubscribe to refresh parent state. */
  onToggle?: () => void;
}

/** Displays a podcast with image, metadata, and subscribe/unsubscribe action. */
export function PodcastCard({
  id,
  title,
  author,
  description,
  imageUrl,
  isSubscribed,
  onToggle,
}: PodcastCardProps) {
  const [loading, setLoading] = useState(false);

  /** Subscribes or unsubscribes from the podcast via API. */
  async function handleToggle() {
    setLoading(true);
    try {
      if (isSubscribed) {
        await apiFetch(`/podcasts/${id}/subscribe`, { method: "DELETE" });
      } else {
        await apiFetch("/podcasts/subscribe", {
          method: "POST",
          body: JSON.stringify({ podcastId: id }),
        });
      }
      onToggle?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <img
        src={imageUrl}
        alt={title}
        className="w-16 h-16 rounded object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold truncate">{title}</h3>
        <p className="text-sm text-zinc-400">{author}</p>
        <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{description}</p>
      </div>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`self-center px-4 py-2 rounded text-sm font-medium transition-colors flex-shrink-0 ${
          isSubscribed
            ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            : "bg-zinc-50 text-zinc-950 hover:bg-zinc-200"
        } disabled:opacity-50`}
      >
        {loading
          ? "..."
          : isSubscribed
            ? "Unsubscribe"
            : "Subscribe"}
      </button>
    </div>
  );
}
