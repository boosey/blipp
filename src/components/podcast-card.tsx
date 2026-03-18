import { ChevronRight } from "lucide-react";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";

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
  const { open } = usePodcastSheet();

  return (
    <button onClick={() => open(id)} className="w-full text-left">
      <div className="flex gap-3 bg-card border border-border rounded-lg p-3 active:scale-[0.98] transition-transform duration-75">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-14 h-14 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded bg-muted flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-muted-foreground">
              {title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{title}</h3>
          <p className="text-xs text-muted-foreground truncate">{author}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {description}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 self-center flex-shrink-0" />
      </div>
    </button>
  );
}
