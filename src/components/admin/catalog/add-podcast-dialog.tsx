import { useState } from "react";
import { Rss, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAdminFetch } from "@/lib/api-client";

export function AddPodcastDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const apiFetch = useAdminFetch();
  const [url, setUrl] = useState("");
  const [validating, setValidating] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    description: string;
    imageUrl?: string;
    episodeCount: number;
    costEstimate: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = () => {
    setValidating(true);
    setError(null);
    setPreview(null);
    // Skip server-side validation since the endpoint doesn't exist.
    // Show a basic preview from the URL; the feed will be validated on import.
    setTimeout(() => {
      setPreview({
        title: url.split('/').pop() ?? 'New Podcast',
        description: 'Feed URL will be validated on import',
        episodeCount: 0,
        costEstimate: 'TBD',
      });
      setValidating(false);
    }, 300);
  };

  const handleImport = () => {
    setImporting(true);
    apiFetch("/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: url, title: preview?.title ?? url }),
    })
      .then(() => { onClose(); })
      .catch((e) => setError(e.message))
      .finally(() => setImporting(false));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#0F1D32] border-white/10 text-[#F9FAFB] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB]">Add Podcast</DialogTitle>
          <DialogDescription className="text-[#9CA3AF]">
            Enter an RSS feed URL to import a new podcast.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://feeds.example.com/podcast.xml"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setPreview(null); setError(null); }}
              className="flex-1 bg-white/5 border-white/10 text-[#F9FAFB] text-xs placeholder:text-[#9CA3AF]/50"
            />
            <Button
              size="sm"
              onClick={handleValidate}
              disabled={!url || validating}
              className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
            >
              {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Validate"}
            </Button>
          </div>

          {error && (
            <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-2 text-[11px] text-[#EF4444]">
              {error}
            </div>
          )}

          {preview && (
            <div className="rounded-md bg-white/[0.03] border border-white/5 p-3 space-y-3">
              <div className="flex items-start gap-3">
                {preview.imageUrl ? (
                  <img src={preview.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-white/5 flex items-center justify-center">
                    <Rss className="h-5 w-5 text-[#9CA3AF]/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{preview.title}</div>
                  <div className="text-[10px] text-[#9CA3AF] mt-0.5 line-clamp-2">{preview.description}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#9CA3AF]">
                <span>{preview.episodeCount} episodes</span>
                <span>Est. cost: {preview.costEstimate}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs">
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!preview || importing}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import Podcast"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
