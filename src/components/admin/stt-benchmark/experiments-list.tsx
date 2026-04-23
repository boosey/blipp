import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical,
  Plus,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { useAdminFetch } from "@/lib/api-client";
import { relativeTime } from "@/lib/admin-formatters";
import { ProgressBar } from "@/components/admin/progress-bar";
import { StatusBadge } from "@/components/admin/status-badge";
import type { SttExperiment, SttExperimentStatus } from "@/types/admin";

const STATUS_STYLES: Record<
  SttExperimentStatus,
  { bg: string; text: string; pulse?: boolean }
> = {
  PENDING: { bg: "#9CA3AF20", text: "#9CA3AF" },
  RUNNING: { bg: "#3B82F620", text: "#3B82F6", pulse: true },
  COMPLETED: { bg: "#10B98120", text: "#10B981" },
  FAILED: { bg: "#EF444420", text: "#EF4444" },
  CANCELLED: { bg: "#EAB30820", text: "#EAB308" },
};

export interface ExperimentsListProps {
  onSelect: (exp: SttExperiment) => void;
  onNewExperiment: () => void;
}

export function ExperimentsList({
  onSelect,
  onNewExperiment,
}: ExperimentsListProps) {
  const apiFetch = useAdminFetch();
  const [experiments, setExperiments] = useState<SttExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadExperiments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<{ data: SttExperiment[] }>(
        "/stt-benchmark/experiments"
      );
      setExperiments(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load experiments");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadExperiments();
  }, [loadExperiments]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full bg-white/5" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="bg-[#0F1D32] border-white/5 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-[#EF4444]" />
          <p className="text-[#EF4444] text-sm">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={loadExperiments}
            className="border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
          >
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#F9FAFB]">Experiments</h2>
          <p className="text-xs text-[#9CA3AF]">
            {experiments.length} experiment{experiments.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={onNewExperiment}
          className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New Experiment
        </Button>
      </div>

      {experiments.length === 0 ? (
        <Card className="bg-[#0F1D32] border-white/5 p-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <FlaskConical className="h-10 w-10 text-[#9CA3AF]/40" />
            <p className="text-[#9CA3AF] text-sm">No experiments yet</p>
            <p className="text-[#9CA3AF]/60 text-xs">
              Create your first STT benchmark experiment to compare models
            </p>
          </div>
        </Card>
      ) : (
        <Card className="bg-[#0F1D32] border-white/5 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-[#9CA3AF] text-xs">Name</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs">Status</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs">Episodes</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs">Models</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs w-40">
                  Progress
                </TableHead>
                <TableHead className="text-[#9CA3AF] text-xs">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {experiments.map((exp) => (
                <TableRow
                  key={exp.id}
                  className="border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => onSelect(exp)}
                >
                  <TableCell className="text-[#F9FAFB] font-medium text-sm">
                    {exp.name}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={exp.status} styles={STATUS_STYLES} />
                  </TableCell>
                  <TableCell className="text-[#9CA3AF] text-sm tabular-nums">
                    {exp.config.episodeIds.length}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {exp.config.models.map((m: any, i: number) => {
                        const label = typeof m === "string" ? m : `${m.modelId}@${m.provider}`;
                        return (
                          <Badge
                            key={`${label}-${i}`}
                            className="bg-white/5 text-[#9CA3AF] text-[9px] font-mono"
                          >
                            {label}
                          </Badge>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={exp.doneTasks} max={exp.totalTasks} />
                      <span className="text-[10px] text-[#9CA3AF] tabular-nums whitespace-nowrap">
                        {exp.doneTasks}/{exp.totalTasks}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[#9CA3AF] text-xs">
                    {relativeTime(exp.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
