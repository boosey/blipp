import { useRef, useState, useCallback, useEffect } from "react";
import { Check, CheckCheck, Trash2 } from "lucide-react";
import { FeedItemCard } from "./feed-item";
import type { FeedItem } from "../types/feed";

const SWIPE_THRESHOLD = 10;
const LISTENED_THRESHOLD = 0.3;
const REMOVE_THRESHOLD = 0.8;

interface SwipeableFeedItemProps {
  item: FeedItem;
  onPlay?: (id: string) => void;
  onToggleListened: (id: string, listened: boolean) => void;
  onRemove: (id: string) => void;
  onEpisodeVote?: (episodeId: string, vote: number) => void;
}

export function SwipeableFeedItem({
  item,
  onPlay,
  onToggleListened,
  onRemove,
  onEpisodeVote,
}: SwipeableFeedItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const leftZoneRef = useRef<HTMLDivElement>(null);
  const rightZoneRef = useRef<HTMLDivElement>(null);
  const leftIconRef = useRef<HTMLDivElement>(null);
  const rightIconRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const swipingRef = useRef(false);
  const offsetRef = useRef(0);
  const [removing, setRemoving] = useState(false);

  // Store callbacks in refs to avoid stale closures
  const callbacksRef = useRef({ onToggleListened, onRemove });
  useEffect(() => {
    callbacksRef.current = { onToggleListened, onRemove };
  }, [onToggleListened, onRemove]);

  const applyTransform = useCallback((dx: number) => {
    const card = cardRef.current;
    const container = containerRef.current;
    if (!card || !container) return;

    const cardWidth = container.offsetWidth;
    const ratio = Math.abs(dx) / cardWidth;

    // Card position — no transition during gesture
    card.style.transform = dx !== 0 ? `translateX(${dx}px)` : "";
    card.style.pointerEvents = dx !== 0 ? "none" : "";

    // Left zone (delete, right side)
    const leftZone = leftZoneRef.current;
    const leftIcon = leftIconRef.current;
    if (leftZone) {
      if (dx < 0) {
        leftZone.style.display = "flex";
        leftZone.style.width = `${Math.abs(dx)}px`;
        const inZone = ratio >= REMOVE_THRESHOLD;
        leftZone.style.backgroundColor = inZone ? "rgba(239,68,68,0.3)" : "var(--color-muted)";
        leftZone.style.color = inZone ? "rgb(248,113,113)" : "var(--color-muted-foreground)";
        if (leftIcon) leftIcon.style.display = inZone ? "block" : "none";
      } else {
        leftZone.style.display = "none";
      }
    }

    // Right zone (listened, left side)
    const rightZone = rightZoneRef.current;
    const rightIcon = rightIconRef.current;
    if (rightZone) {
      if (dx > 0) {
        rightZone.style.display = "flex";
        rightZone.style.width = `${dx}px`;
        const inZone = ratio >= LISTENED_THRESHOLD;
        rightZone.style.backgroundColor = inZone ? "rgba(59,130,246,0.3)" : "var(--color-muted)";
        rightZone.style.color = inZone ? "rgb(96,165,250)" : "var(--color-muted-foreground)";
        if (rightIcon) rightIcon.style.display = inZone ? "block" : "none";
      } else {
        rightZone.style.display = "none";
      }
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    swipingRef.current = false;
    offsetRef.current = 0;
    // Remove snap-back transition during active gesture
    if (cardRef.current) cardRef.current.style.transition = "none";
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - startXRef.current;
    const deltaY = e.touches[0].clientY - startYRef.current;

    if (!swipingRef.current && Math.abs(deltaY) > Math.abs(deltaX)) {
      startXRef.current = 0;
      return;
    }

    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      swipingRef.current = true;
      e.preventDefault();
      offsetRef.current = deltaX;
      applyTransform(deltaX);
    }
  }, [applyTransform]);

  const onTouchEnd = useCallback(() => {
    const container = containerRef.current;
    if (!swipingRef.current || !container) {
      applyTransform(0);
      startXRef.current = 0;
      return;
    }

    const dx = offsetRef.current;
    const cardWidth = container.offsetWidth;
    const swipeRatio = Math.abs(dx) / cardWidth;

    if (dx < 0 && swipeRatio >= REMOVE_THRESHOLD) {
      setRemoving(true);
      callbacksRef.current.onRemove(item.id);
    } else if (dx > 0 && swipeRatio >= LISTENED_THRESHOLD) {
      callbacksRef.current.onToggleListened(item.id, !item.listened);
    }

    // Animate snap-back
    if (cardRef.current) cardRef.current.style.transition = "transform 0.2s ease-out";
    applyTransform(0);
    startXRef.current = 0;
    offsetRef.current = 0;
    swipingRef.current = false;
  }, [item.id, item.listened, applyTransform]);

  if (removing) {
    return (
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: 0, opacity: 0, marginBottom: 0 }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Left swipe action zone — delete (right side) */}
      <div className="absolute inset-y-0 right-0 items-center justify-center px-6" style={{ display: "none" }} ref={leftZoneRef}>
        <div ref={leftIconRef} style={{ display: "none" }}><Trash2 className="w-5 h-5" /></div>
      </div>

      {/* Right swipe action zone — listened toggle (left side) */}
      <div className="absolute inset-y-0 left-0 items-center justify-center px-6" style={{ display: "none" }} ref={rightZoneRef}>
        <div ref={rightIconRef} style={{ display: "none" }}>
          {item.listened ? <Check className="w-5 h-5" /> : <CheckCheck className="w-5 h-5" />}
        </div>
      </div>

      {/* Card */}
      <div ref={cardRef} className="relative will-change-transform">
        <FeedItemCard item={item} onPlay={onPlay} onEpisodeVote={onEpisodeVote} />
      </div>
    </div>
  );
}
