import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAdminFetch } from "@/lib/api-client";

interface DlqData {
  stuckJobs: { id: string; currentStage: string; stuckMinutes: number }[];
  exhaustedRetries: { id: string; stage: string; retryCount: number; errorMessage?: string }[];
}

export function DlqSection() {
  const apiFetch = useAdminFetch();
  const [dlq, setDlq] = useState<DlqData | null>(null);
  const [dismissingAll, setDismissingAll] = useState(false);

  const loadDlq = useCallback(() => {
    apiFetch<{ data: DlqData }>("/pipeline/dlq")
      .then((r) => setDlq(r.data))
      .catch(() => {});
  }, [apiFetch]);

  useEffect(() => { loadDlq(); }, [loadDlq]);

  const handleDismissAll = async () => {
    const prev = dlq;
    setDismissingAll(true);
    setDlq({ stuckJobs: [], exhaustedRetries: [] });
    try {
      await apiFetch("/pipeline/jobs/bulk-dismiss", { method: "PATCH" });
    } catch {
      setDlq(prev);
      toast.error("Failed to dismiss all DLQ items");
    } finally {
      setDismissingAll(false);
    }
  };

  if (!dlq) return null;
  const totalIssues =
    (dlq.stuckJobs?.length ?? 0) + (dlq.exhaustedRetries?.length ?? 0);
  if (totalIssues === 0) return null;

  return (
    <div className="bg-[#EF4444]/5 border border-[#EF4444]/20 rounded-xl p-4 mt-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#EF4444] flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Dead Letter Queue ({totalIssues} issues)
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10 text-xs gap-1"
          disabled={dismissingAll}
          onClick={handleDismissAll}
        >
          <XCircle className="h-3 w-3" />
          Dismiss All
        </Button>
      </div>
      {dlq.stuckJobs?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-[#9CA3AF] mb-1.5">
            Stuck Jobs ({dlq.stuckJobs.length})
          </p>
          <div className="space-y-1">
            {dlq.stuckJobs.map((j) => (
              <div
                key={j.id}
                className="text-xs bg-[#0F1D32] border border-white/5 rounded p-2 font-mono text-[#9CA3AF]"
              >
                {j.id.slice(0, 12)}... &middot; {j.currentStage} &middot;
                stuck {j.stuckMinutes}min
              </div>
            ))}
          </div>
        </div>
      )}
      {dlq.exhaustedRetries?.length > 0 && (
        <div>
          <p className="text-xs text-[#9CA3AF] mb-1.5">
            Exhausted Retries ({dlq.exhaustedRetries.length})
          </p>
          <div className="space-y-1">
            {dlq.exhaustedRetries.map((s) => (
              <div
                key={s.id}
                className="text-xs bg-[#0F1D32] border border-white/5 rounded p-2 font-mono text-[#9CA3AF]"
              >
                {s.stage} &middot; {s.retryCount} retries
                {s.errorMessage
                  ? ` · ${s.errorMessage.slice(0, 80)}`
                  : ""}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
