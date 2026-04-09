import { useCallback } from "react";
import { X, Trash2, ListMusic, ChevronDown, GripVertical, Play } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";
import { useAudio } from "../contexts/audio-context";
import { formatDuration } from "../lib/feed-utils";

export function QueueSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    currentItem,
    queue,
    removeFromQueue,
    clearQueue,
    skipToQueueItem,
    reorderQueue,
  } = useAudio();

  const handlePlayItem = useCallback(
    (itemId: string) => {
      skipToQueueItem(itemId);
    },
    [skipToQueueItem]
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index > 0) reorderQueue(index, index - 1);
    },
    [reorderQueue]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index < queue.length - 1) reorderQueue(index, index + 1);
    },
    [reorderQueue, queue.length]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="h-[92dvh] rounded-t-2xl bg-background border-border flex flex-col px-0 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ListMusic className="w-5 h-5 text-primary" />
            <SheetTitle className="text-base font-bold">Queue</SheetTitle>
          </div>
          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <button
                onClick={clearQueue}
                className="text-xs font-medium text-destructive hover:text-destructive/80 px-2.5 py-1 rounded-full bg-destructive/10 active:scale-95 transition-all"
              >
                Clear all
              </button>
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 text-muted-foreground hover:text-foreground active:scale-90 transition-all"
              aria-label="Close queue"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>

        <SheetDescription className="sr-only">
          Manage your playback queue
        </SheetDescription>

        {/* Divider */}
        <div className="h-px bg-border mx-4" />

        {/* Now Playing */}
        {currentItem && (
          <div className="px-4 py-3 flex-shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-2">
              Now Playing
            </p>
            <div className="flex items-center gap-3">
              {currentItem.podcast.imageUrl ? (
                <img
                  src={currentItem.podcast.imageUrl}
                  alt=""
                  className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
                  style={{ boxShadow: "0 2px 8px oklch(0 0 0 / 0.25)" }}
                />
              ) : (
                <div className="w-11 h-11 rounded-lg bg-muted flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">
                  {currentItem.episode.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {currentItem.podcast.title}
                  {currentItem.briefing?.clip?.actualSeconds
                    ? ` \u00B7 ${formatDuration(currentItem.briefing.clip.actualSeconds, currentItem.durationTier)}`
                    : ""}
                </p>
              </div>
              <NowPlayingBars />
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-border mx-4" />

        {/* Up Next */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-3">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "oklch(0.3 0.02 250)" }}
              >
                <ListMusic className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Queue is empty
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Swipe right on any briefing to add it
                </p>
              </div>
            </div>
          ) : (
            <div className="px-4 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Up Next &middot; {queue.length}
              </p>
              <ul className="divide-y divide-border">
                {queue.map((item, index) => (
                  <QueueItem
                    key={item.id}
                    item={item}
                    index={index}
                    isFirst={index === 0}
                    isLast={index === queue.length - 1}
                    onPlay={handlePlayItem}
                    onRemove={removeFromQueue}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  NowPlayingBars — animated equalizer bars                          */
/* ------------------------------------------------------------------ */

function NowPlayingBars() {
  return (
    <div className="flex items-end gap-[2px] h-4 w-4 flex-shrink-0">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="waveform-bar w-[3px] rounded-full flex-shrink-0"
          style={{
            animationDelay: `${i * 0.18}s`,
            background: "var(--primary)",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  QueueItem — individual queue row with actions                     */
/* ------------------------------------------------------------------ */

function QueueItem({
  item,
  index,
  isFirst,
  isLast,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: import("../types/feed").FeedItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onPlay: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5 group">
      {/* Reorder grip + arrows */}
      <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
        <button
          onClick={() => onMoveUp(index)}
          disabled={isFirst}
          className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-20 transition-colors"
          aria-label="Move up"
        >
          <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
            <path d="M5 0L10 6H0z" />
          </svg>
        </button>
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30" />
        <button
          onClick={() => onMoveDown(index)}
          disabled={isLast}
          className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-20 transition-colors"
          aria-label="Move down"
        >
          <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
            <path d="M5 6L0 0h10z" />
          </svg>
        </button>
      </div>

      {/* Artwork */}
      <button
        onClick={() => onPlay(item.id)}
        className="flex-shrink-0 relative group/play"
        aria-label={`Play ${item.episode.title}`}
      >
        {item.podcast.imageUrl ? (
          <img
            src={item.podcast.imageUrl}
            alt=""
            className="w-10 h-10 rounded-lg object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-muted" />
        )}
        <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover/play:opacity-100 transition-opacity">
          <Play className="w-4 h-4 text-white" fill="white" stroke="none" />
        </div>
      </button>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{item.episode.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {item.podcast.title}
          {item.briefing?.clip?.actualSeconds
            ? ` \u00B7 ${formatDuration(item.briefing.clip.actualSeconds, item.durationTier)}`
            : ""}
        </p>
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(item.id)}
        className="flex-shrink-0 p-2 text-muted-foreground/50 hover:text-destructive active:scale-90 transition-all"
        aria-label={`Remove ${item.episode.title} from queue`}
      >
        <X className="w-4 h-4" />
      </button>
    </li>
  );
}
