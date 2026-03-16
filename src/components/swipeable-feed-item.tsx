import { useRef, useState, useCallback } from "react";
import { Check, CheckCheck, Trash2 } from "lucide-react";
import { FeedItemCard } from "./feed-item";
import type { FeedItem } from "../types/feed";

const SWIPE_THRESHOLD = 10; // px to distinguish swipe from tap
const LISTENED_THRESHOLD = 0.3; // 30% of card width (right swipe)
const REMOVE_THRESHOLD = 0.8; // 80% of card width (left swipe)

interface SwipeableFeedItemProps {
  item: FeedItem;
  onPlay?: (id: string) => void;
  onToggleListened: (id: string, listened: boolean) => void;
  onRemove: (id: string) => void;
}

export function SwipeableFeedItem({
  item,
  onPlay,
  onToggleListened,
  onRemove,
}: SwipeableFeedItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const swipingRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [removing, setRemoving] = useState(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    swipingRef.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - startXRef.current;
    const deltaY = e.touches[0].clientY - startYRef.current;

    // If vertical movement is greater, let the scroll happen
    if (!swipingRef.current && Math.abs(deltaY) > Math.abs(deltaX)) {
      startXRef.current = 0;
      return;
    }

    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      swipingRef.current = true;
      e.preventDefault();
      setOffset(deltaX);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!swipingRef.current || !containerRef.current) {
      setOffset(0);
      startXRef.current = 0;
      return;
    }

    const cardWidth = containerRef.current.offsetWidth;
    const swipeRatio = Math.abs(offset) / cardWidth;

    if (offset < 0 && swipeRatio >= REMOVE_THRESHOLD) {
      // Left swipe past 80% — remove
      setRemoving(true);
      onRemove(item.id);
    } else if (offset > 0 && swipeRatio >= LISTENED_THRESHOLD) {
      // Right swipe past 30% — toggle listened
      onToggleListened(item.id, !item.listened);
    }

    setOffset(0);
    startXRef.current = 0;
    swipingRef.current = false;
  }, [offset, item.id, item.listened, onToggleListened, onRemove]);

  if (removing) {
    return (
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: 0, opacity: 0, marginBottom: 0 }}
      />
    );
  }

  const cardWidth = containerRef.current?.offsetWidth ?? 300;
  const swipeRatio = Math.abs(offset) / cardWidth;

  // Left swipe: delete zone
  const isRemoveZone = offset < 0 && swipeRatio >= REMOVE_THRESHOLD;
  // Right swipe: listened zone
  const isListenedZone = offset > 0 && swipeRatio >= LISTENED_THRESHOLD;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Left swipe action zone — delete (right side, behind card) */}
      {offset < 0 && (
        <div className="absolute inset-0 flex items-center justify-end">
          <div
            className={`h-full flex items-center justify-center px-6 transition-colors ${
              isRemoveZone
                ? "bg-red-500/30 text-red-400"
                : "bg-zinc-800 text-zinc-500"
            }`}
            style={{ width: Math.abs(offset) }}
          >
            {isRemoveZone && <Trash2 className="w-5 h-5" />}
          </div>
        </div>
      )}

      {/* Right swipe action zone — listened toggle (left side, behind card) */}
      {offset > 0 && (
        <div className="absolute inset-0 flex items-center justify-start">
          <div
            className={`h-full flex items-center justify-center px-6 transition-colors ${
              isListenedZone
                ? "bg-blue-500/30 text-blue-400"
                : "bg-zinc-800 text-zinc-500"
            }`}
            style={{ width: offset }}
          >
            {isListenedZone && (
              item.listened ? (
                <Check className="w-5 h-5" />
              ) : (
                <CheckCheck className="w-5 h-5" />
              )
            )}
          </div>
        </div>
      )}

      {/* Card — transforms on swipe */}
      <div
        className="relative transition-transform duration-75"
        style={{
          transform: offset !== 0 ? `translateX(${offset}px)` : undefined,
          pointerEvents: offset !== 0 ? "none" : undefined,
        }}
      >
        <FeedItemCard item={item} onPlay={onPlay} />
      </div>
    </div>
  );
}
