import { WelcomeCard } from "../../components/welcome-card";
import { SwipeableFeedItem } from "../../components/swipeable-feed-item";
import type { FeedItem } from "../../types/feed";

interface GeneratingSectionProps {
  readyItems: FeedItem[];
  skeletonCount: number;
  generatingTimedOut: boolean;
  onRefresh: () => void;
  onPlay: (id: string) => void;
  onRemove: (id: string) => void;
  onEpisodeVote: (id: string, vote: number) => void;
  onCancel: (id: string) => void;
}

export function GeneratingSection({
  readyItems,
  skeletonCount,
  generatingTimedOut,
  onRefresh,
  onPlay,
  onRemove,
  onEpisodeVote,
  onCancel,
}: GeneratingSectionProps) {
  return (
    <div>
      <WelcomeCard
        readyCount={readyItems.length}
        totalCount={readyItems.length + skeletonCount}
        timedOut={generatingTimedOut}
        onRetry={onRefresh}
      />

      {/* Ready items with animation */}
      {readyItems.length > 0 && (
        <div className="space-y-2 mb-2">
          {readyItems.map((item, index) => (
            <div
              key={item.id}
              className="feed-item-enter"
              style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
            >
              <SwipeableFeedItem
                item={item}
                onPlay={onPlay}
                onRemove={onRemove}
                onEpisodeVote={onEpisodeVote}
                onCancel={onCancel}
              />
            </div>
          ))}
        </div>
      )}

      {/* Skeleton cards for pending items */}
      {skeletonCount > 0 && (
        <div className="space-y-2">
          {Array.from({ length: Math.min(skeletonCount, 3) }, (_, i) => (
            <div
              key={`skeleton-${i}`}
              className="flex gap-3 bg-card border border-border rounded-lg p-3"
            >
              <div className="w-12 h-12 rounded flex-shrink-0 bg-accent animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded-md bg-accent animate-pulse" />
                <div className="h-4 w-3/4 rounded-md bg-accent animate-pulse" />
                <div className="h-3 w-1/2 rounded-md bg-accent animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
