import { useRef, useCallback } from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";
import { PodcastDetail } from "../pages/podcast-detail";

export function PodcastDetailSheet() {
  const { podcastId, close } = usePodcastSheet();
  const startY = useRef(0);
  const currentY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    currentY.current = e.touches[0].clientY;
    const dy = currentY.current - startY.current;
    // Only allow drag-down when scroll is at top
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    if (dy > 0 && scrollTop <= 0 && sheetRef.current) {
      e.preventDefault();
      sheetRef.current.style.transform = `translateY(${dy}px)`;
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    const dy = currentY.current - startY.current;
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 0.2s ease-out";
      sheetRef.current.style.transform = "";
    }
    if (dy > 100 && scrollTop <= 0) {
      close();
    }
  }, [close]);

  return (
    <Sheet open={podcastId !== null} onOpenChange={(open) => { if (!open) close(); }} modal={false}>
      <SheetContent
        ref={sheetRef}
        side="bottom"
        showCloseButton={false}
        className="h-[85vh] rounded-t-2xl bg-background border-border flex flex-col p-0"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <SheetTitle className="sr-only">Podcast Detail</SheetTitle>
        <SheetDescription className="sr-only">Podcast details and episodes</SheetDescription>
        {/* Drag handle + close button (visible on hover/desktop) */}
        <div className="flex-shrink-0 pt-3 pb-2 px-4 relative">
          <div className="w-10 h-1 bg-muted rounded-full mx-auto" />
          <button
            onClick={close}
            className="absolute right-3 top-2 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 hover:opacity-100 focus:opacity-100 sm:opacity-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Scrollable content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-8">
          {podcastId && <PodcastDetail podcastId={podcastId} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
