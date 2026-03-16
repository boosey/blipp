import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface PodcastCardProps {
  id: string;
  title: string;
  author: string;
  description: string;
  imageUrl: string;
}

export function PodcastCard({
  id,
  title,
  author,
  description,
  imageUrl,
}: PodcastCardProps) {
  return (
    <Link to={`/discover/${id}`}>
      <div className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-14 h-14 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded bg-zinc-700 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-zinc-400">
              {title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{title}</h3>
          <p className="text-xs text-zinc-400 truncate">{author}</p>
          <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
            {description}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-600 self-center flex-shrink-0" />
      </div>
    </Link>
  );
}
