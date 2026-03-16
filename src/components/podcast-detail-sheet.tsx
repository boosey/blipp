import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";
import { PodcastDetail } from "../pages/podcast-detail";

export function PodcastDetailSheet() {
  const { podcastId, close } = usePodcastSheet();

  return (
    <Sheet open={podcastId !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent
        side="bottom"
        className="h-[95vh] rounded-t-2xl bg-zinc-950 border-zinc-800 flex flex-col p-0"
      >
        <SheetTitle className="sr-only">Podcast Detail</SheetTitle>
        <SheetDescription className="sr-only">Podcast details and episodes</SheetDescription>
        {/* Header with close button */}
        <div className="flex items-center justify-end px-4 pt-3 pb-0">
          <button
            onClick={close}
            className="p-1.5 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {podcastId && <PodcastDetail podcastId={podcastId} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
