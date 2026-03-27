import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAdminFetch } from "@/lib/admin-api";
import { VerdictBadge } from "@/components/admin/claims-benchmark/experiments-list";
import type {
  ClaimsBenchmarkResult,
  ClaimsJudgeOutput,
} from "@/types/admin";

// ── Helpers ──

function qualifiedModel(model: string, provider: string): string {
  return `${model} (${provider})`;
}

// ── Props ──

export interface EpisodeVerdictViewProps {
  episodeId: string;
  baseline: ClaimsBenchmarkResult | null;
  candidates: ClaimsBenchmarkResult[];
}

// ── Component ──

export function EpisodeVerdictView({
  episodeId,
  baseline,
  candidates,
}: EpisodeVerdictViewProps) {
  const apiFetch = useAdminFetch();
  const [baselineClaims, setBaselineClaims] = useState<any[] | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(
    candidates[0]?.id ?? null
  );
  const [candidateClaims, setCandidateClaims] = useState<any[] | null>(null);
  const [verdicts, setVerdicts] = useState<ClaimsJudgeOutput | null>(null);
  const [loading, setLoading] = useState(false);

  // Load baseline claims
  useEffect(() => {
    if (!baseline?.id || baseline.status !== "COMPLETED") return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ data: { claims: any[] } }>(
          `/claims-benchmark/results/${baseline.id}/claims`
        );
        if (!cancelled) setBaselineClaims(data.data.claims);
      } catch {
        // silently handle
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseline?.id, baseline?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load candidate claims and verdicts when selected
  useEffect(() => {
    if (!selectedCandidate) return;
    const candidate = candidates.find((c) => c.id === selectedCandidate);
    if (!candidate || candidate.status !== "COMPLETED") return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [claimsResp, verdictsResp] = await Promise.all([
          apiFetch<{ data: { claims: any[] } }>(
            `/claims-benchmark/results/${selectedCandidate}/claims`
          ),
          candidate.judgeStatus === "COMPLETED"
            ? apiFetch<{ data: ClaimsJudgeOutput }>(
                `/claims-benchmark/results/${selectedCandidate}/verdicts`
              )
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCandidateClaims(claimsResp.data.claims);
        if (verdictsResp) setVerdicts(verdictsResp.data);
        else setVerdicts(null);
      } catch {
        // silently handle
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCandidate]); // eslint-disable-line react-hooks/exhaustive-deps

  const completedCandidates = candidates.filter(
    (c) => c.status === "COMPLETED"
  );

  return (
    <div className="space-y-3">
      {/* Candidate selector */}
      {completedCandidates.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#9CA3AF]">Compare with:</span>
          <div className="flex gap-1">
            {completedCandidates.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCandidate(c.id)}
                className={cn(
                  "px-2 py-1 rounded text-[10px] font-mono transition-colors",
                  selectedCandidate === c.id
                    ? "bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30"
                    : "text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 border border-white/5"
                )}
              >
                {qualifiedModel(c.model, c.provider)}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-[#3B82F6]" />
          <span className="text-xs text-[#9CA3AF]">Loading claims...</span>
        </div>
      )}

      {/* Side-by-side view */}
      {baselineClaims && !loading && (
        <div className="grid grid-cols-2 gap-4">
          {/* Baseline claims (left) */}
          <div>
            <h4 className="text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider mb-2">
              Baseline Claims ({baselineClaims.length})
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {baselineClaims
                .sort(
                  (a: any, b: any) => (b.importance ?? 0) - (a.importance ?? 0)
                )
                .map((claim: any, idx: number) => {
                  const verdict = verdicts?.verdicts.find(
                    (v) => v.baselineIndex === idx
                  );
                  return (
                    <div
                      key={idx}
                      className="rounded-md bg-white/[0.02] border border-white/5 p-2.5 space-y-1"
                    >
                      <div className="flex items-start gap-2">
                        <Badge className="bg-[#3B82F6]/10 text-[#3B82F6] text-[9px] shrink-0">
                          {claim.importance ?? "?"}
                        </Badge>
                        {verdict && <VerdictBadge status={verdict.status} />}
                        <span className="text-xs text-[#F9FAFB]">
                          {claim.claim}
                        </span>
                      </div>
                      {claim.speaker && (
                        <p className="text-[10px] text-[#9CA3AF] pl-7">
                          Speaker: {claim.speaker}
                        </p>
                      )}
                      {verdict?.reason && (
                        <p className="text-[10px] text-[#9CA3AF]/70 pl-7 italic">
                          {verdict.reason}
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Candidate claims (right) */}
          <div>
            <h4 className="text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider mb-2">
              Candidate Claims ({candidateClaims?.length ?? 0})
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {candidateClaims?.map((claim: any, idx: number) => {
                const isHallucination = verdicts?.hallucinations.some(
                  (h) => h.candidateIndex === idx
                );
                const hallucination = verdicts?.hallucinations.find(
                  (h) => h.candidateIndex === idx
                );
                const matchedVerdict = verdicts?.verdicts.find(
                  (v) => v.matchedCandidateIndex === idx
                );

                return (
                  <div
                    key={idx}
                    className={cn(
                      "rounded-md border p-2.5 space-y-1",
                      isHallucination
                        ? "bg-[#F59E0B]/5 border-[#F59E0B]/20"
                        : "bg-white/[0.02] border-white/5"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {isHallucination && (
                        <Badge className="bg-[#F59E0B]/10 text-[#F59E0B] text-[9px] shrink-0">
                          Hallucination
                        </Badge>
                      )}
                      {matchedVerdict && (
                        <VerdictBadge status={matchedVerdict.status} />
                      )}
                      <span className="text-xs text-[#F9FAFB]">
                        {claim.claim}
                      </span>
                    </div>
                    {claim.speaker && (
                      <p className="text-[10px] text-[#9CA3AF] pl-7">
                        Speaker: {claim.speaker}
                      </p>
                    )}
                    {hallucination?.reason && (
                      <p className="text-[10px] text-[#F59E0B]/70 pl-7 italic">
                        {hallucination.reason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Error messages */}
      {candidates.some((c) => c.errorMessage) && (
        <div className="space-y-1 mt-2">
          {candidates
            .filter((c) => c.errorMessage)
            .map((c) => (
              <div
                key={c.id}
                className="text-[10px] text-[#EF4444] bg-[#EF4444]/5 rounded px-2 py-1"
              >
                <span className="font-mono">
                  {qualifiedModel(c.model, c.provider)}
                </span>
                : {c.errorMessage}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
