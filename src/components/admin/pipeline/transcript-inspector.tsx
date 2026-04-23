import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminFetch } from "@/lib/api-client";

export interface TranscriptInspectorProps {
  open: boolean;
  onClose: () => void;
  episodeId: string | null;
}

export function TranscriptInspector({
  open,
  onClose,
  episodeId,
}: TranscriptInspectorProps) {
  const apiFetch = useAdminFetch();
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!open || !episodeId) return;
    setLoading(true);
    setTranscript(null);
    apiFetch<{ data: { title?: string; transcript?: string; distillation?: { transcript?: string } } }>(
      `/episodes/${episodeId}`
    )
      .then((r) => {
        setTitle(r.data.title ?? episodeId);
        setTranscript(
          r.data.transcript ?? r.data.distillation?.transcript ?? null
        );
      })
      .catch(() => setTranscript(null))
      .finally(() => setLoading(false));
  }, [open, episodeId, apiFetch]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB] sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB] text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#8B5CF6]" />
            Transcript: {title}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-4 bg-white/5 rounded" />
              ))}
            </div>
          ) : transcript ? (
            <pre className="text-[11px] font-mono text-[#9CA3AF] whitespace-pre-wrap break-words p-4 leading-relaxed">
              {transcript}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
              <FileText className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-xs">No transcript available</span>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
