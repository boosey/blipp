import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAdminFetch } from "@/lib/admin-api";
import type { SttBenchmarkResult, SttResultsGrid } from "@/types/admin";
import { computeWordDiff, WordDiffView } from "./transcript-diff";
import type { DiffOp } from "./transcript-diff";

export interface HypothesisDiffViewerProps {
  resultId: string;
  model: string;
  speed: number;
  refText: string | null;
  onNeedRef: () => void;
}

export function HypothesisDiffViewer({
  resultId,
  model,
  speed,
  refText,
  onNeedRef,
}: HypothesisDiffViewerProps) {
  const apiFetch = useAdminFetch();
  const [hypText, setHypText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffOps, setDiffOps] = useState<DiffOp[] | null>(null);
  const [showDiff, setShowDiff] = useState(true);

  const load = useCallback(async () => {
    if (hypText !== null) return;
    setLoading(true);
    onNeedRef();
    try {
      const data = await apiFetch<{ data: { transcript: string } }>(
        `/stt-benchmark/results/${resultId}/transcript`
      );
      setHypText(data.data.transcript);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, resultId, hypText, onNeedRef]);

  useEffect(() => {
    if (hypText !== null && refText !== null) {
      setDiffOps(computeWordDiff(refText, hypText));
    }
  }, [hypText, refText]);

  return (
    <AccordionItem value={`transcript-${resultId}`} className="border-white/5">
      <AccordionTrigger
        className="text-[#9CA3AF] text-[10px] hover:no-underline py-1"
        onClick={load}
      >
        <span className="font-mono">{model}</span> @ {speed}x — hypothesis (as compared)
      </AccordionTrigger>
      <AccordionContent>
        {loading && (
          <div className="text-[#9CA3AF] text-xs flex items-center gap-2 py-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading...
          </div>
        )}
        {error && <div className="text-[#EF4444] text-xs py-2">{error}</div>}
        {hypText !== null && (
          <div>
            {diffOps && (
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setShowDiff((d) => !d)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded border transition-colors",
                    showDiff
                      ? "border-[#F59E0B]/40 text-[#FCD34D] bg-[#F59E0B]/10"
                      : "border-white/10 text-[#9CA3AF] hover:text-[#D1D5DB]"
                  )}
                >
                  {showDiff ? "Diff on" : "Diff off"}
                </button>
                {showDiff && (
                  <span className="text-[10px] text-[#9CA3AF] flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-[#EF4444]/30" /> deleted
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-[#10B981]/30" /> inserted
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-[#F59E0B]/30" /> replaced
                    </span>
                  </span>
                )}
              </div>
            )}
            {showDiff && diffOps ? (
              <WordDiffView ops={diffOps} />
            ) : (
              <pre className="text-[#D1D5DB] text-[11px] leading-relaxed whitespace-pre-wrap break-words bg-[#0A1628] rounded p-3 max-h-64 overflow-auto font-sans">
                {hypText}
              </pre>
            )}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function ResultStatusBadge({
  status,
}: {
  status: SttBenchmarkResult["status"];
}) {
  const styles: Record<
    string,
    { bg: string; text: string; pulse?: boolean }
  > = {
    PENDING: { bg: "#9CA3AF20", text: "#9CA3AF" },
    RUNNING: { bg: "#3B82F620", text: "#3B82F6", pulse: true },
    POLLING: { bg: "#8B5CF620", text: "#8B5CF6", pulse: true },
    COMPLETED: { bg: "#10B98120", text: "#10B981" },
    FAILED: { bg: "#EF444420", text: "#EF4444" },
  };
  const s = styles[status] || styles.PENDING;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase",
        s.pulse && "animate-pulse"
      )}
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {status}
    </span>
  );
}

export function computeWinners(grid: SttResultsGrid[]) {
  const completed = grid.filter((g) => g.completedCount > 0);
  if (completed.length === 0) return null;

  const withWer = completed.filter((g) => g.avgWer > 0);
  const withCost = completed.filter((g) => g.avgCost > 0);
  const withLatency = completed.filter((g) => g.avgLatency > 0);

  return {
    lowestWer:
      withWer.length > 0
        ? withWer.reduce((a, b) => (a.avgWer < b.avgWer ? a : b))
        : null,
    lowestCost:
      withCost.length > 0
        ? withCost.reduce((a, b) => (a.avgCost < b.avgCost ? a : b))
        : null,
    fastest:
      withLatency.length > 0
        ? withLatency.reduce((a, b) =>
            a.avgLatency < b.avgLatency ? a : b
          )
        : null,
  };
}
