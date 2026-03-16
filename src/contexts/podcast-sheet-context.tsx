import { createContext, useContext, useState, useCallback } from "react";

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
