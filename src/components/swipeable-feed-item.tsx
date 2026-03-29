import { useRef, useState, useCallback } from "react";
import { ListPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FeedItemCard } from "./feed-item";
import { useAudio } from "../contexts/audio-context";
import type { FeedItem } from "../types/feed";

const SWIPE_THRESHOLD = 30;
const BUTTON_WIDTH = 72; // px

interface SwipeableFeedItemProps {
  item: FeedItem;
  onPlay?: (id: string) => void;
  onRemove: (id: string) => void;
  onEpisodeVote?: (episodeId: string, vote: number) => void;
}

export function SwipeableFeedItem({
  item,
  onPlay,
  onRemove,
  onEpisodeVote,
}: SwipeableFeedItemProps) {
  const audio = useAudio();
  const cardRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const swipingRef = useRef(false);
  const directionRef = useRef<"left" | "right" | null>(null);
  const offsetRef = useRef(0);
  const [revealed, setRevealed] = useState<"left" | "right" | null>(null);
  const [removing, setRemoving] = useState(false);

  const snapTo = useCallback((dx: number) => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transition = "transform 0.2s ease-out";
    card.style.transform = dx !== 0 ? `translateX(${dx}px)` : "";
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    swipingRef.current = false;
    directionRef.current = null;
    offsetRef.current = 0;
    if (cardRef.current) cardRef.current.style.transition = "none";
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - startXRef.current;
    const deltaY = e.touches[0].clientY - startYRef.current;

    // Lock to vertical scroll if vertical wins
    if (!swipingRef.current && Math.abs(deltaY) > Math.abs(deltaX)) {
      startXRef.current = 0;
      return;
    }

    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      swipingRef.current = true;
      e.preventDefault();

      // Lock direction on first move
      if (!directionRef.current) {
        directionRef.current = deltaX < 0 ? "left" : "right";
      }

      // Clamp movement to button width in the locked direction
      let clamped: number;
      if (directionRef.current === "left") {
        clamped = Math.max(deltaX, -BUTTON_WIDTH);
        clamped = Math.min(clamped, 0); // don't allow opposite direction
      } else {
        clamped = Math.min(deltaX, BUTTON_WIDTH);
        clamped = Math.max(clamped, 0);
      }

      offsetRef.current = clamped;
      const card = cardRef.current;
      if (card) {
        card.style.transform = `translateX(${clamped}px)`;
        card.style.pointerEvents = "none";
      }
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!swipingRef.current) {
      return;
    }

    const dx = offsetRef.current;
    const threshold = BUTTON_WIDTH * 0.4;

    if (Math.abs(dx) >= threshold && directionRef.current) {
      // Snap open to reveal button
      const target = directionRef.current === "left" ? -BUTTON_WIDTH : BUTTON_WIDTH;
      snapTo(target);
      setRevealed(directionRef.current);
    } else {
      // Snap back
      snapTo(0);
      setRevealed(null);
    }

    if (cardRef.current) cardRef.current.style.pointerEvents = "";
    swipingRef.current = false;
    directionRef.current = null;
    offsetRef.current = 0;
  }, [snapTo]);

  // Close revealed button when tapping the card area
  const handleCardClick = useCallback(() => {
    if (revealed) {
      snapTo(0);
      setRevealed(null);
    }
  }, [revealed, snapTo]);

  function handleRemove() {
    setRemoving(true);
    onRemove(item.id);
  }

  function handleAddToQueue() {
    if (item.status !== "READY" || !item.briefing?.clip) {
      toast.error("This briefing isn't ready yet");
      return;
    }
    audio.addToQueue(item);
    toast.success("Added to queue");
    snapTo(0);
    setRevealed(null);
  }

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
      className="relative overflow-hidden rounded-lg"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Right-side button (swipe left to reveal) — Delete */}
      <button
        onClick={handleRemove}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500/20 text-red-400 active:bg-red-500/30 transition-colors"
        style={{ width: BUTTON_WIDTH }}
        aria-label="Remove from feed"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      {/* Left-side button (swipe right to reveal) — Add to Queue */}
      <button
        onClick={handleAddToQueue}
        className="absolute inset-y-0 left-0 flex items-center justify-center bg-blue-500/20 text-blue-400 active:bg-blue-500/30 transition-colors"
        style={{ width: BUTTON_WIDTH }}
        aria-label="Add to queue"
      >
        <ListPlus className="w-5 h-5" />
      </button>

      {/* Card */}
      <div
        ref={cardRef}
        className="relative will-change-transform bg-background"
        onClick={handleCardClick}
      >
        <FeedItemCard item={item} onPlay={onPlay} onEpisodeVote={onEpisodeVote} onRemove={() => handleRemove()} onAddToQueue={handleAddToQueue} />
      </div>

    </div>
  );
}
