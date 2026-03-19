import { useState, useEffect, useRef } from "react";
import { useAdminFetch } from "@/lib/admin-api";
import { toast } from "sonner";
import { Inbox, RefreshCw, RotateCcw } from "lucide-react";

interface StuckJob {
  id: string;
  requestId: string;
  episodeId: string;
  currentStage: string;
  updatedAt: string;
  stuckMinutes: number;
}

interface ExhaustedRetry {
  id: string;
  jobId: string;
  stage: string;
  errorMessage: string;
  retryCount: number;
  completedAt: string;
}

interface DlqData {
  stuckJobs: StuckJob[];
  exhaustedRetries: ExhaustedRetry[];
}

export default function DlqMonitor() {
  const adminFetch = useAdminFetch();
  const [data, setData] = useState<DlqData | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadData() {
    try {
      const res = await adminFetch<{ data: DlqData }>("/pipeline/dlq");
      setData(res.data);
    } catch {
      toast.error("Failed to load DLQ data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRetry(jobId: string) {
    setRetrying(jobId);
    try {
      await adminFetch(`/pipeline/jobs/${jobId}/retry`, { method: "POST" });
      toast.success("Job queued for retry");
      await loadData();
    } catch {
      toast.error("Retry failed");
    } finally {
      setRetrying(null);
    }
  }

  const totalIssues = data
    ? data.stuckJobs.length + data.exhaustedRetries.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Inbox className="h-5 w-5 text-[#F59E0B]" />
        <h1 className="text-lg font-semibold">Dead Letter Queue</h1>
        {totalIssues > 0 && (
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#EF4444]/10 text-[#EF4444]">
            {totalIssues}
          </span>
        )}
        <button
          onClick={() => { setLoading(true); loadData(); }}
          className="ml-auto text-[#9CA3AF] hover:text-[#F9FAFB] transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && !data ? (
        <p className="text-[#9CA3AF] text-sm">Loading...</p>
      ) : (
        <>
          {/* Stuck Jobs */}
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-[#9CA3AF]">
              Stuck Jobs
              <span className="ml-1 text-xs text-[#9CA3AF]/60">
                (IN_PROGRESS &gt; 1 hour)
              </span>
            </h2>

            {data?.stuckJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[#9CA3AF] bg-[#1A2942] border border-white/5 rounded-lg">
                <Inbox className="h-8 w-8 mb-2 opacity-40" />
                <span className="text-sm">No stuck jobs</span>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0F1D32] text-[#9CA3AF] text-xs">
                      <th className="text-left px-3 py-2 font-medium">Request</th>
                      <th className="text-left px-3 py-2 font-medium">Episode</th>
                      <th className="text-left px-3 py-2 font-medium">Stage</th>
                      <th className="text-left px-3 py-2 font-medium">Stuck</th>
                      <th className="text-left px-3 py-2 font-medium">Updated</th>
                      <th className="text-right px-3 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.stuckJobs.map((job) => (
                      <tr
                        key={job.id}
                        className="border-t border-white/5 bg-[#1A2942] hover:bg-[#1A2942]/80"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-[#F9FAFB]">
                          {job.requestId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[#F9FAFB]">
                          {job.episodeId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#F59E0B]/10 text-[#F59E0B]">
                            {job.currentStage}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-[#EF4444]">
                          {job.stuckMinutes}m
                        </td>
                        <td className="px-3 py-2 text-xs text-[#9CA3AF]">
                          {new Date(job.updatedAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => handleRetry(job.id)}
                            disabled={retrying === job.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-[#3B82F6]/10 text-[#3B82F6] hover:bg-[#3B82F6]/20 disabled:opacity-50 transition-colors"
                          >
                            <RotateCcw className={`h-3 w-3 ${retrying === job.id ? "animate-spin" : ""}`} />
                            Retry
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Exhausted Retries */}
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-[#9CA3AF]">
              Exhausted Retries
              <span className="ml-1 text-xs text-[#9CA3AF]/60">
                (failed 3+ times)
              </span>
            </h2>

            {data?.exhaustedRetries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[#9CA3AF] bg-[#1A2942] border border-white/5 rounded-lg">
                <Inbox className="h-8 w-8 mb-2 opacity-40" />
                <span className="text-sm">No exhausted retries</span>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0F1D32] text-[#9CA3AF] text-xs">
                      <th className="text-left px-3 py-2 font-medium">Job</th>
                      <th className="text-left px-3 py-2 font-medium">Stage</th>
                      <th className="text-left px-3 py-2 font-medium">Error</th>
                      <th className="text-left px-3 py-2 font-medium">Retries</th>
                      <th className="text-left px-3 py-2 font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.exhaustedRetries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-t border-white/5 bg-[#1A2942] hover:bg-[#1A2942]/80"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-[#F9FAFB]">
                          {entry.jobId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EF4444]/10 text-[#EF4444]">
                            {entry.stage}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-[#9CA3AF] max-w-xs truncate">
                          {entry.errorMessage}
                        </td>
                        <td className="px-3 py-2 text-xs text-[#F9FAFB]">
                          {entry.retryCount}
                        </td>
                        <td className="px-3 py-2 text-xs text-[#9CA3AF]">
                          {new Date(entry.completedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
