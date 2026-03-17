import { useEffect, useRef } from "react";

/**
 * Polls a callback at the given interval, pausing when the tab is hidden.
 * Fires immediately on tab refocus to avoid stale data.
 */
export function usePolling(callback: () => void, intervalMs: number, enabled = true) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let id: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (!id) id = setInterval(() => savedCallback.current(), intervalMs);
    }
    function stop() {
      if (id) { clearInterval(id); id = null; }
    }
    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        savedCallback.current(); // Immediate refresh on tab focus
        start();
      }
    }

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
