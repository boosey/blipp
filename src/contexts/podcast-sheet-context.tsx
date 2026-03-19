import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

interface PodcastSheetState {
  podcastId: string | null;
  open: (id: string) => void;
  close: () => void;
}

const PodcastSheetContext = createContext<PodcastSheetState | null>(null);

export function PodcastSheetProvider({ children }: { children: React.ReactNode }) {
  const [podcastId, setPodcastId] = useState<string | null>(null);
  const open = useCallback((id: string) => setPodcastId(id), []);
  const close = useCallback(() => setPodcastId(null), []);

  // Auto-close sheet on route changes
  const { pathname } = useLocation();
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      setPodcastId(null);
    }
  }, [pathname]);

  return (
    <PodcastSheetContext.Provider value={{ podcastId, open, close }}>
      {children}
    </PodcastSheetContext.Provider>
  );
}

export function usePodcastSheet() {
  const ctx = useContext(PodcastSheetContext);
  if (!ctx) throw new Error("usePodcastSheet must be inside PodcastSheetProvider");
  return ctx;
}
