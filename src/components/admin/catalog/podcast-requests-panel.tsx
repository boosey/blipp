import { useState, useEffect, useCallback } from "react";
import { Check, X, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAdminFetch } from "@/lib/api-client";

interface PodcastRequestItem {
  id: string;
  feedUrl: string;
  title?: string;
  status: string;
  userEmail?: string;
  createdAt: string;
}

export interface PodcastRequestsPanelProps {
  onApproved?: () => void;
}

export function PodcastRequestsPanel({ onApproved }: PodcastRequestsPanelProps) {
  const apiFetch = useAdminFetch();
  const [requests, setRequests] = useState<PodcastRequestItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(() => {
    setLoading(true);
    apiFetch<{ data: PodcastRequestItem[] }>("/podcasts/requests?status=PENDING")
      .then((r) => setRequests(r.data || []))
      .catch(() => toast.error("Failed to load podcast requests"))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function handleApprove(id: string) {
    try {
      await apiFetch(`/podcasts/requests/${id}/approve`, { method: "POST" });
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast.success("Request approved — podcast added to catalog");
      onApproved?.();
    } catch {
      toast.error("Failed to approve request");
    }
  }

  async function handleReject(id: string) {
    try {
      await apiFetch(`/podcasts/requests/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ adminNote: "Not available" }),
      });
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast.success("Request rejected");
    } catch {
      toast.error("Failed to reject request");
    }
  }

  if (loading) return <p className="text-[#9CA3AF] text-xs py-2">Loading requests...</p>;
  if (requests.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[#9CA3AF] text-xs py-2">
        <Inbox className="h-3.5 w-3.5" />
        No pending podcast requests
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {requests.map((req) => (
        <div key={req.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate text-[#F9FAFB]">{req.title || req.feedUrl}</p>
            <p className="text-[10px] text-[#9CA3AF]">
              {req.userEmail || "Unknown user"} &middot; {new Date(req.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-1.5 ml-3">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleApprove(req.id)}
              className="h-7 w-7 bg-green-900/20 text-green-400 hover:bg-green-900/40"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleReject(req.id)}
              className="h-7 w-7 bg-red-900/20 text-red-400 hover:bg-red-900/40"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
