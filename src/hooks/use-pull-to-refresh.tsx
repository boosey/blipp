import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";

const THRESHOLD = 60;

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}

interface PullToRefreshResult {
  indicator: ReactNode;
  bind: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

export function usePullToRefresh({
  onRefresh,
  disabled = false,
}: PullToRefreshOptions): PullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing) return;
      // Only start pull tracking if the scroll container is at the top.
      // Walk up to find the scrollable parent (<main> element).
      const scrollParent = (e.currentTarget as HTMLElement).closest("main");
      if (scrollParent && scrollParent.scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = false;
    },
    [disabled, refreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing || startYRef.current === 0) return;
      const deltaY = e.touches[0].clientY - startYRef.current;
      if (deltaY > 10) {
        pullingRef.current = true;
        // Dampen the pull distance (50% ratio)
        setPullDistance(Math.min(deltaY * 0.5, THRESHOLD * 2));
      } else if (!pullingRef.current) {
        // User is scrolling down — reset
        startYRef.current = 0;
      }
    },
    [disabled, refreshing]
  );

  const onTouchEnd = useCallback(async () => {
    if (!pullingRef.current) {
      startYRef.current = 0;
      return;
    }
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD); // Hold at threshold during refresh
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    startYRef.current = 0;
    pullingRef.current = false;
  }, [pullDistance, refreshing, onRefresh]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      setPullDistance(0);
      pullingRef.current = false;
    };
  }, []);

  const indicator: ReactNode =
    pullDistance > 0 || refreshing ? (
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: refreshing ? THRESHOLD : pullDistance }}
      >
        <div
          className={`w-6 h-6 border-2 border-zinc-500 border-t-white rounded-full ${
            refreshing ? "animate-spin" : ""
          }`}
          style={{
            transform: refreshing
              ? undefined
              : `rotate(${(pullDistance / THRESHOLD) * 360}deg)`,
            opacity: Math.min(pullDistance / THRESHOLD, 1),
          }}
        />
      </div>
    ) : null;

  return {
    indicator,
    bind: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
