import { useRef, useState, useCallback, useEffect } from "react";
import { ListPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FeedItemCard } from "./feed-item";
import { useAudio } from "../contexts/audio-context";
import type { FeedItem } from "../types/feed";

const BUTTON_WIDTH = 72; // px
const DIRECTION_LOCK_THRESHOLD = 8; // px — minimum move before locking axis
const VELOCITY_SNAP_THRESHOLD = 0.4; // px/ms — fast flick forces snap regardless of distance
const DISTANCE_SNAP_RATIO = 0.4; // fraction of BUTTON_WIDTH to trigger snap
const RUBBER_BAND_FACTOR = 0.35; // resistance past BUTTON_WIDTH

// Spring physics constants (critically damped spring feel)
const SPRING_STIFFNESS = 300;
const SPRING_DAMPING = 26;
const SPRING_MASS = 1;

/**
 * Attempt a spring animation via Web Animations API.
 * Falls back to a CSS transition on browsers without `linear()` support.
 */
function springAnimate(
  el: HTMLElement,
  fromX: number,
  toX: number,
  initialVelocity: number,
  onFinish?: () => void,
) {
  // Compute spring duration analytically (time to settle within 0.5px)
  const omega = Math.sqrt(SPRING_STIFFNESS / SPRING_MASS);
  const zeta = SPRING_DAMPING / (2 * Math.sqrt(SPRING_STIFFNESS * SPRING_MASS));
  const settleThreshold = 0.5;
  const amplitude = Math.max(Math.abs(fromX - toX), 1);
  const duration = Math.min(
    (-Math.log(settleThreshold / amplitude) / (zeta * omega)) * 1000,
    600,
  );

  // Sample the spring curve to build a linear() easing approximation
  const steps = 20;
  const points: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = t * (duration / 1000);
    // Under-damped / critically-damped spring position
    const decay = Math.exp(-zeta * omega * s);
    const v0Contribution =
      initialVelocity !== 0
        ? (initialVelocity / (omega * Math.sqrt(1 - zeta * zeta))) *
          decay *
          Math.sin(omega * Math.sqrt(1 - Math.min(zeta * zeta, 0.9999)) * s)
        : 0;
    const positionNorm =
      1 -
      decay *
        Math.cos(omega * Math.sqrt(1 - Math.min(zeta * zeta, 0.9999)) * s) +
      (amplitude > 0 ? v0Contribution / amplitude : 0);
    points.push(Math.max(0, Math.min(1, positionNorm)));
  }
  // Ensure endpoints
  points[0] = 0;
  points[points.length - 1] = 1;

  const linearEasing = `linear(${points.map((p) => p.toFixed(4)).join(", ")})`;

  try {
    const anim = el.animate(
      [
        { transform: `translateX(${fromX}px)` },
        { transform: toX !== 0 ? `translateX(${toX}px)` : "none" },
      ],
      { duration, easing: linearEasing, fill: "forwards" },
    );
    anim.onfinish = () => {
      el.style.transform = toX !== 0 ? `translateX(${toX}px)` : "";
      anim.cancel();
      onFinish?.();
    };
  } catch {
    // Fallback: CSS transition with spring-like feel
    el.style.transition = `transform ${Math.round(duration)}ms cubic-bezier(0.25, 1, 0.5, 1)`;
    el.style.transform = toX !== 0 ? `translateX(${toX}px)` : "";
    const tid = setTimeout(() => {
      el.style.transition = "none";
      onFinish?.();
    }, duration);
    // Cleanup on unmount isn't critical for a timeout this short
    void tid;
  }
}

function rubberBand(offset: number, limit: number): number {
  if (Math.abs(offset) <= limit) return offset;
  const sign = offset < 0 ? -1 : 1;
  const overshoot = Math.abs(offset) - limit;
  return sign * (limit + overshoot * RUBBER_BAND_FACTOR);
}

// Global registry so only one row is open at a time
type CloseCallback = () => void;
const openRowRegistry = new Set<CloseCallback>();

function registerOpenRow(close: CloseCallback) {
  // Close all other open rows
  for (const cb of openRowRegistry) {
    if (cb !== close) cb();
  }
  openRowRegistry.clear();
  openRowRegistry.add(close);
}

function unregisterOpenRow(close: CloseCallback) {
  openRowRegistry.delete(close);
}

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
  const startTimeRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const lastMoveXRef = useRef(0);
  const swipingRef = useRef(false);
  const directionLockedRef = useRef(false);
  const isHorizontalRef = useRef(false);
  const currentOffsetRef = useRef(0);
  const [revealed, setRevealed] = useState<"left" | "right" | null>(null);
  const [removing, setRemoving] = useState(false);

  const closeRow = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const from = currentOffsetRef.current;
    if (from === 0) return;
    currentOffsetRef.current = 0;
    springAnimate(card, from, 0, 0);
    setRevealed(null);
  }, []);

  // Cleanup registry on unmount
  useEffect(() => {
    const cb = closeRow;
    return () => unregisterOpenRow(cb);
  }, [closeRow]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // Close other open rows when starting a new gesture
      if (revealed === null) {
        for (const cb of openRowRegistry) {
          if (cb !== closeRow) cb();
        }
      }

      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      startTimeRef.current = Date.now();
      lastMoveTimeRef.current = Date.now();
      lastMoveXRef.current = e.touches[0].clientX;
      swipingRef.current = false;
      directionLockedRef.current = false;
      isHorizontalRef.current = false;

      const card = cardRef.current;
      if (card) {
        // Cancel any running animation
        card.getAnimations?.()?.forEach((a) => a.cancel());
        card.style.transition = "none";
      }
    },
    [revealed, closeRow],
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const deltaX = touchX - startXRef.current;
    const deltaY = touchY - startYRef.current;

    // Direction lock: decide once if this is horizontal or vertical
    if (!directionLockedRef.current) {
      if (
        Math.abs(deltaX) < DIRECTION_LOCK_THRESHOLD &&
        Math.abs(deltaY) < DIRECTION_LOCK_THRESHOLD
      ) {
        return; // Not enough movement to decide
      }
      directionLockedRef.current = true;
      isHorizontalRef.current = Math.abs(deltaX) >= Math.abs(deltaY);
      if (!isHorizontalRef.current) return; // Vertical — bail out
    }

    if (!isHorizontalRef.current) return;

    swipingRef.current = true;
    e.preventDefault();

    // Track instantaneous velocity
    lastMoveTimeRef.current = Date.now();
    lastMoveXRef.current = touchX;

    // Apply rubber-banding past BUTTON_WIDTH
    const offset = rubberBand(deltaX, BUTTON_WIDTH);

    currentOffsetRef.current = offset;
    const card = cardRef.current;
    if (card) {
      card.style.transform = `translateX(${offset}px)`;
      card.style.pointerEvents = "none";
    }
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!swipingRef.current) return;

      const card = cardRef.current;
      if (card) card.style.pointerEvents = "";

      const dx = currentOffsetRef.current;
      // Compute velocity from last move event (more accurate than total distance / total time)
      const lastTouch = e.changedTouches[0];
      const timeSinceLastMove = Date.now() - lastMoveTimeRef.current;
      const dxSinceLastMove = lastTouch.clientX - lastMoveXRef.current;
      const velocity =
        timeSinceLastMove > 0 ? dxSinceLastMove / timeSinceLastMove : 0; // px/ms, signed

      const distanceThreshold = BUTTON_WIDTH * DISTANCE_SNAP_RATIO;
      const shouldSnapOpen =
        (Math.abs(dx) >= distanceThreshold || Math.abs(velocity) >= VELOCITY_SNAP_THRESHOLD) &&
        // Velocity must agree with displacement direction (or displacement alone is enough)
        (Math.abs(dx) >= distanceThreshold || Math.sign(velocity) === Math.sign(dx));

      if (shouldSnapOpen && card) {
        const direction: "left" | "right" = dx < 0 ? "left" : "right";
        const target = direction === "left" ? -BUTTON_WIDTH : BUTTON_WIDTH;
        springAnimate(card, dx, target, velocity * 1000); // convert to px/s
        currentOffsetRef.current = target;
        setRevealed(direction);
        registerOpenRow(closeRow);
      } else if (card) {
        springAnimate(card, dx, 0, velocity * 1000);
        currentOffsetRef.current = 0;
        setRevealed(null);
        unregisterOpenRow(closeRow);
      }

      swipingRef.current = false;
    },
    [closeRow],
  );

  const handleCardClick = useCallback(() => {
    if (revealed) {
      closeRow();
    }
  }, [revealed, closeRow]);

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
    closeRow();
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
