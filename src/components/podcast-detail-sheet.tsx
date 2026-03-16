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
        className="h-[85vh] rounded-t-2xl bg-zinc-950 border-zinc-800 flex flex-col p-0"
      >
        <SheetTitle className="sr-only">Podcast Detail</SheetTitle>
        <SheetDescription className="sr-only">Podcast details and episodes</SheetDescription>
        {/* Drag handle + close */}
        <div className="flex-shrink-0 pt-3 pb-2 px-4">
          <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-end">
            <button
              onClick={close}
              className="p-2 -mr-1 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {podcastId && <PodcastDetail podcastId={podcastId} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
