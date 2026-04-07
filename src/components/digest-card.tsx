import { useState } from "react";
import { Play, Loader2, MoreHorizontal, Newspaper, X } from "lucide-react";
import { useAudio } from "../contexts/audio-context";
import { usePlan } from "../contexts/plan-context";
import { formatDuration } from "../lib/feed-utils";
import { TierPicker } from "./tier-picker";
import { DigestSheet } from "./digest-sheet";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "./ui/popover";
import type { Digest } from "../types/digest";
import type { DurationTier } from "../lib/duration-tiers";
import type { FeedItem } from "../types/feed";

function digestToFeedItem(d: Digest): FeedItem {
  const firstSource = d.sources[0];
  return {
    id: d.id,
    requestId: null,
    source: "SUBSCRIPTION",
    status: d.status,
    errorMessage: null,
    listened: d.listened,
    listenedAt: null,
    playbackPositionSeconds: null,
    durationTier: d.durationTier,
    createdAt: d.createdAt,
    podcast: {
      id: firstSource?.podcast.id ?? "",
      title: "Your Digest",
      imageUrl: firstSource?.podcast.imageUrl ?? null,
      podcastIndexId: null,
    },
    episode: {
      id: d.id,
      title: `Digest — ${d.sources.length} episodes`,
      publishedAt: d.createdAt,
      durationSeconds: d.actualSeconds,
    },
    episodeVote: 0,
    briefing: d.audioUrl
      ? {
          id: d.id,
          clip: {
            audioUrl: d.audioUrl,
            actualSeconds: d.actualSeconds,
            previewText: null,
          },
          adAudioUrl: null,
        }
      : null,
  };
}

/** Unique podcast artwork URLs from digest sources (max 3). */
function sourceArtwork(d: Digest): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of d.sources) {
    const url = s.podcast.imageUrl;
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push(url);
      if (result.length >= 3) break;
    }
  }
  return result;
}

export function DigestCard({
  digest,
  onDismiss,
  onDurationChange,
}: {
  digest: Digest;
  onDismiss?: () => void;
  onDurationChange?: (tier: DurationTier) => void;
}) {
  const audio = useAudio();
  const { maxDurationMinutes } = usePlan();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Hidden when listened
  if (digest.listened) return null;

  const isCreating =
    digest.status === "PENDING" || digest.status === "PROCESSING";
  const isReady = digest.status === "READY" && digest.audioUrl;
  const isFailed = digest.status === "FAILED";
  const artwork = sourceArtwork(digest);
  const episodeCount = digest.sources.length;
  const durationStr = formatDuration(digest.actualSeconds, digest.durationTier);

  function handlePlay(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isReady) return;
    audio.play(digestToFeedItem(digest));
  }

  const cardInner = (
    <div
      className={`relative bg-card border border-border rounded-lg overflow-hidden ${
        isFailed ? "" : "digest-border-gradient"
      }`}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Overlapping micro-avatars */}
        <div className="digest-avatars flex-shrink-0">
          {artwork.length > 0 ? (
            artwork.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                className="w-5 h-5"
                style={{ zIndex: 3 - i }}
              />
            ))
          ) : (
            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
              <Newspaper className="w-3 h-3 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Center text */}
        <div className="flex-1 min-w-0">
          {isFailed ? (
            <p className="text-sm font-medium text-red-400/80 truncate">
              Digest failed
            </p>
          ) : (
            <p className="text-sm font-medium truncate">
              Your Digest
              <span className="text-muted-foreground font-normal">
                {" · "}
                {episodeCount} ep{episodeCount !== 1 ? "s" : ""}
                {" · "}
                {isCreating ? "Creating..." : durationStr}
              </span>
            </p>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isCreating && (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          )}
          {isReady && (
            <button
              aria-label="Play digest"
              onClick={handlePlay}
              className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-[0.95] transition-transform duration-75"
            >
              <Play className="w-3.5 h-3.5 ml-0.5" />
            </button>
          )}
          {isFailed && onDismiss && (
            <button
              aria-label="Dismiss"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Overflow menu */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                aria-label="Digest options"
                onClick={(e) => e.stopPropagation()}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Digest duration
              </p>
              <TierPicker
                selected={digest.durationTier as DurationTier}
                onSelect={(tier) => {
                  onDurationChange?.(tier);
                  setPopoverOpen(false);
                }}
                maxDurationMinutes={maxDurationMinutes}
              />
              <button
                onClick={() => {
                  setPopoverOpen(false);
                  setSheetOpen(true);
                }}
                className="mt-3 w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
              >
                <Newspaper className="w-3.5 h-3.5" />
                View sources
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );

  // Wrap creating state with the glow sweep
  const card = isCreating ? (
    <div className="relative py-[3px]">
      <div className="absolute inset-x-0 inset-y-0 rounded-lg overflow-hidden">
        <div
          className="absolute inset-0 w-1/3"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--color-primary), transparent)",
            opacity: 0.45,
            animation: "creating-sweep 2.5s ease-in-out infinite",
          }}
        />
      </div>
      <div className="relative">{cardInner}</div>
    </div>
  ) : (
    cardInner
  );

  return (
    <>
      <div
        role={isReady ? "button" : undefined}
        tabIndex={isReady ? 0 : undefined}
        className={
          isReady
            ? "w-full text-left active:scale-[0.98] transition-transform duration-75 cursor-pointer"
            : "w-full"
        }
        onClick={() => {
          if (isReady) {
            audio.play(digestToFeedItem(digest));
          }
        }}
        onKeyDown={(e) => {
          if (isReady && (e.key === "Enter" || e.key === " ")) {
            audio.play(digestToFeedItem(digest));
          }
        }}
      >
        {card}
      </div>
      <DigestSheet
        digest={digest}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onPlay={() => {
          if (isReady) audio.play(digestToFeedItem(digest));
        }}
      />
    </>
  );
}
