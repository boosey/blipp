import { useState } from "react";
import { Link } from "react-router-dom";
import { useApiFetch } from "../lib/api";

export interface PodcastCardProps {
  id: string;
  title: string;
  author: string;
  description: string;
  imageUrl: string;
  isSubscribed: boolean;
  /** If from local DB, the database ID for navigation */
  dbId?: string;
  feedUrl?: string;
  onToggle?: () => void;
}

export function PodcastCard({
  id,
  title,
  author,
  description,
  imageUrl,
  isSubscribed,
  dbId,
  feedUrl,
  onToggle,
}: PodcastCardProps) {
  const apiFetch = useApiFetch();
  const [loading, setLoading] = useState(false);

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      if (isSubscribed) {
        await apiFetch(`/podcasts/subscribe/${dbId || id}`, { method: "DELETE" });
      } else {
        await apiFetch("/podcasts/subscribe", {
          method: "POST",
          body: JSON.stringify({
            feedUrl: feedUrl || "",
            title,
            description,
            imageUrl,
            podcastIndexId: id,
            author,
          }),
        });
      }
      onToggle?.();
    } finally {
      setLoading(false);
    }
  }

  const card = (
    <div className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <img
        src={imageUrl}
        alt={title}
        className="w-14 h-14 rounded object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm truncate">{title}</h3>
        <p className="text-xs text-zinc-400 truncate">{author}</p>
        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{description}</p>
      </div>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`self-center px-3 py-1.5 rounded text-xs font-medium transition-colors flex-shrink-0 ${
          isSubscribed
            ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            : "bg-white text-zinc-950 hover:bg-zinc-200"
        } disabled:opacity-50`}
      >
        {loading ? "..." : isSubscribed ? "Subscribed" : "Subscribe"}
      </button>
    </div>
  );

  if (dbId) {
    return <Link to={`/discover/${dbId}`}>{card}</Link>;
  }

  return card;
}
