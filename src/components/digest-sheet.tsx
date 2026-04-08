import { Play, Newspaper } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "./ui/sheet";
import { formatDuration } from "../lib/feed-utils";
import type { Digest, DigestSource } from "../types/digest";

const SOURCE_LABELS: Record<DigestSource["type"], string> = {
  subscribed: "Subscriptions",
  favorited: "Favorites",
  recommended: "Recommended",
};

const SOURCE_ORDER: DigestSource["type"][] = [
  "subscribed",
  "favorited",
  "recommended",
];

function SourceBreakdownBar({ sources }: { sources: DigestSource[] }) {
  const totalSeconds = sources.reduce((sum, s) => sum + s.segmentSeconds, 0);
  if (totalSeconds === 0) return null;

  const groups: { type: DigestSource["type"]; seconds: number }[] = [];
  for (const t of SOURCE_ORDER) {
    const seconds = sources
      .filter((s) => s.type === t)
      .reduce((sum, s) => sum + s.segmentSeconds, 0);
    if (seconds > 0) groups.push({ type: t, seconds });
  }

  return (
    <div className="flex gap-0.5 h-1 rounded-full overflow-hidden">
      {groups.map((g) => (
        <div
          key={g.type}
          className={`digest-bar-${g.type} rounded-full`}
          style={{ flex: g.seconds / totalSeconds }}
        />
      ))}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function DigestSheet({
  digest,
  open,
  onOpenChange,
  onPlay,
}: {
  digest: Digest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlay?: () => void;
}) {
  const isReady = digest.status === "READY" && digest.audioUrl;
  const sources = Array.isArray(digest.sources) ? digest.sources : [];
  const grouped = new Map<DigestSource["type"], DigestSource[]>();
  for (const s of sources) {
    if (!grouped.has(s.type)) grouped.set(s.type, []);
    grouped.get(s.type)!.push(s);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[70vh] overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-muted-foreground" />
            <SheetTitle className="text-base">Your Digest</SheetTitle>
          </div>
          <SheetDescription>
            {formatDate(digest.date)} ·{" "}
            {formatDuration(digest.actualSeconds, sources.length > 0 ? Math.ceil((sources.length * 30) / 60) : 1)}
          </SheetDescription>
        </SheetHeader>

        {/* Source breakdown bar */}
        <div className="px-4">
          <SourceBreakdownBar sources={sources} />
          <div className="flex gap-4 mt-1.5">
            {SOURCE_ORDER.map((type) => {
              const count = grouped.get(type)?.length ?? 0;
              if (count === 0) return null;
              return (
                <div key={type} className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full digest-bar-${type}`}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {SOURCE_LABELS[type]} ({count})
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source list */}
        <div className="px-4 space-y-4 pb-2">
          {SOURCE_ORDER.map((type) => {
            const items = grouped.get(type);
            if (!items?.length) return null;
            return (
              <div key={type}>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {SOURCE_LABELS[type]}
                </h4>
                <div className="space-y-2">
                  {items.map((source, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      {source.podcast.imageUrl ? (
                        <img
                          src={source.podcast.imageUrl}
                          alt=""
                          className="w-6 h-6 rounded flex-shrink-0 object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded bg-muted flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          {source.episodeTitle}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {source.podcast.title}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {Math.ceil(source.segmentSeconds / 60)}m
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Play button */}
        {isReady && onPlay && (
          <SheetFooter>
            <button
              onClick={() => {
                onPlay();
                onOpenChange(false);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-transform duration-75"
            >
              <Play className="w-4 h-4" />
              Play Digest
            </button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
