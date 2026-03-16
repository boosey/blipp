import { useNavigate, useLocation } from "react-router-dom";
import { useCallback } from "react";
import { flushSync } from "react-dom";

const TAB_ORDER: Record<string, number> = {
  "/home": 0,
  "/discover": 1,
  "/library": 2,
  "/settings": 3,
};

function getTabIndex(path: string): number | null {
  for (const [prefix, index] of Object.entries(TAB_ORDER)) {
    if (path === prefix || path.startsWith(prefix + "/")) return index;
  }
  return null;
}

export function useViewTransitionNavigate() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return useCallback(
    (to: string, direction?: "forward" | "back") => {
      if (!document.startViewTransition) {
        navigate(to);
        return;
      }

      // Auto-detect direction from tab positions if not specified
      if (!direction) {
        const fromIdx = getTabIndex(pathname);
        const toIdx = getTabIndex(to);
        if (fromIdx !== null && toIdx !== null && fromIdx !== toIdx) {
          direction = toIdx > fromIdx ? "forward" : "back";
        } else {
          // Default to forward for non-tab navigation (e.g., into podcast detail)
          direction = "forward";
        }
      }

      document.documentElement.dataset.direction = direction;

      document.startViewTransition(() => {
        flushSync(() => {
          navigate(to);
        });
      });
    },
    [navigate, pathname]
  );
}
