import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, Clock, Cpu } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAdminFetch } from "@/lib/api-client";
import { relativeTime } from "./helpers";
import type { EmbeddingsStatus } from "./types";

export interface EmbeddingsTabProps {
  apiFetch: ReturnType<typeof useAdminFetch>;
}

export function EmbeddingsTab({ apiFetch }: EmbeddingsTabProps) {
  const [status, setStatus] = useState<EmbeddingsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const loadStatus = useCallback(() => {
    setLoading(true);
    apiFetch<{ data: EmbeddingsStatus }>("/recommendations/embeddings/status")
      .then((r) => setStatus(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleToggle = useCallback(
    (enabled: boolean) => {
      setToggling(true);
      apiFetch<{ data: unknown }>("/recommendations/config", {
        method: "PATCH",
        body: JSON.stringify({
          updates: [{ key: "recommendations.embeddings.enabled", value: enabled }],
        }),
      })
        .then(() => {
          setStatus((prev) => (prev ? { ...prev, enabled } : prev));
          toast.success(enabled ? "Embeddings enabled" : "Embeddings disabled");
        })
        .catch((err) => toast.error(`Failed: ${err.message}`))
        .finally(() => setToggling(false));
    },
    [apiFetch]
  );

  const handleRecompute = useCallback(() => {
    setRecomputing(true);
    apiFetch<{ data: unknown }>("/recommendations/embeddings/recompute", {
      method: "POST",
    })
      .then(() => {
        toast.success("Embedding recompute started");
        loadStatus();
      })
      .catch((err) => toast.error(`Failed: ${err.message}`))
      .finally(() => setRecomputing(false));
  }, [apiFetch, loadStatus]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 bg-white/5 rounded-lg" />
        <Skeleton className="h-32 bg-white/5 rounded-lg" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
        <Cpu className="h-8 w-8 mb-3 opacity-20" />
        <span className="text-xs">Failed to load embeddings status</span>
      </div>
    );
  }

  const podcastPct = status.podcastsTotal > 0
    ? (status.podcastsWithEmbeddings / status.podcastsTotal) * 100
    : 0;
  const userPct = status.usersTotal > 0
    ? (status.usersWithEmbeddings / status.usersTotal) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* Enable toggle + model */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[#F9FAFB]">Embeddings</div>
            <div className="text-[10px] text-[#9CA3AF] mt-0.5">
              Semantic similarity for recommendation scoring
            </div>
          </div>
          <Switch
            checked={status.enabled}
            disabled={toggling}
            onCheckedChange={handleToggle}
          />
        </div>
        <Separator className="bg-white/5" />
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-[#9CA3AF]" />
          <span className="text-[11px] text-[#9CA3AF]">Model:</span>
          <span className="text-[11px] font-mono text-[#F9FAFB]">{status.model}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-4">
        <div className="text-xs font-semibold text-[#F9FAFB]">Coverage</div>

        {/* Podcasts */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF]">Podcasts</span>
            <span className="text-[10px] font-mono tabular-nums text-[#F9FAFB]">
              {status.podcastsWithEmbeddings} / {status.podcastsTotal}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#8B5CF6] transition-all"
              style={{ width: `${podcastPct}%` }}
            />
          </div>
        </div>

        {/* Users */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF]">Users</span>
            <span className="text-[10px] font-mono tabular-nums text-[#F9FAFB]">
              {status.usersWithEmbeddings} / {status.usersTotal}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#3B82F6] transition-all"
              style={{ width: `${userPct}%` }}
            />
          </div>
        </div>

        <Separator className="bg-white/5" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-[#9CA3AF]">
            <Clock className="h-3 w-3" />
            Last compute: {relativeTime(status.lastComputeAt)}
          </div>
          <Button
            size="sm"
            disabled={recomputing}
            onClick={handleRecompute}
            className="bg-[#8B5CF6]/15 text-[#8B5CF6] hover:bg-[#8B5CF6]/25 border border-[#8B5CF6]/20 text-xs"
          >
            {recomputing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Recompute Embeddings
          </Button>
        </div>
      </div>
    </div>
  );
}
