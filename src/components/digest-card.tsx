import { useState } from "react";
import { Play, Loader2, Newspaper, X } from "lucide-react";
import { useAudio } from "../contexts/audio-context";
import { formatDuration } from "../lib/feed-utils";
import { DigestSheet } from "./digest-sheet";
import type { Digest } from "../types/digest";
import type { FeedItem } from "../types/feed";

function digestToFeedItem(d: Digest): FeedItem {
  const sources = Array.isArray(d.sources) ? d.sources : [];
  const firstSource = sources[0];
  const count = d.episodeCount ?? sources.length;
  return {
    id: d.id,
    requestId: null,
    source: "SUBSCRIPTION",
    status: d.status,
    errorMessage: null,
    listened: d.listened,
    listenedAt: null,
    playbackPositionSeconds: null,
    durationTier: count > 0 ? Math.ceil((count * 30) / 60) : 1,
    createdAt: d.createdAt ?? new Date().toISOString(),
    podcast: {
      id: firstSource?.podcast.id ?? "",
      title: "Your Digest",
      imageUrl: firstSource?.podcast.imageUrl ?? null,
      podcastIndexId: null,
    },
    episode: {
      id: d.id,
      title: `Digest — ${count} episodes`,
      publishedAt: d.createdAt ?? new Date().toISOString(),
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
  if (!Array.isArray(d.sources)) return result;
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
}: {
  digest: Digest;
  onDismiss?: () => void;
}) {
  const audio = useAudio();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Hidden when listened
  if (digest.listened) return null;

  const isCreating =
    digest.status === "PENDING" || digest.status === "PROCESSING";
  const isReady = digest.status === "READY" && digest.audioUrl;
  const isFailed = digest.status === "FAILED";
  const artwork = sourceArtwork(digest);
  const sources = Array.isArray(digest.sources) ? digest.sources : [];
  const episodeCount = digest.episodeCount ?? sources.length;
  const estimatedSeconds = episodeCount * 30;
  // Don't trust DB actualSeconds (bitrate estimate is unreliable) — use episode count × 30s
  const durationStr = estimatedSeconds > 0
    ? `${Math.floor(estimatedSeconds / 60)}:${(estimatedSeconds % 60).toString().padStart(2, "0")}`
    : "1m";

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

          {/* View sources */}
          <button
            aria-label="View digest sources"
            onClick={(e) => {
              e.stopPropagation();
              setSheetOpen(true);
            }}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Newspaper className="w-4 h-4" />
          </button>
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
