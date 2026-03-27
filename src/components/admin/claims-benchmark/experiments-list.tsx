import { useState, useEffect, useCallback } from "react";
import {
  Scale,
  Plus,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui/card";
import { useAdminFetch } from "@/lib/admin-api";
import { StatusBadge } from "@/components/admin/status-badge";
import { ProgressBar } from "@/components/admin/progress-bar";
import { relativeTime } from "@/lib/admin-formatters";
import type {
  ClaimsExperiment,
  ClaimsExperimentStatus,
} from "@/types/admin";

// ── Constants ──

export const STATUS_STYLES: Record<
  ClaimsExperimentStatus,
  { bg: string; text: string; pulse?: boolean }
> = {
  PENDING: { bg: "#9CA3AF20", text: "#9CA3AF" },
  RUNNING: { bg: "#3B82F620", text: "#3B82F6", pulse: true },
  JUDGING: { bg: "#8B5CF620", text: "#8B5CF6", pulse: true },
  COMPLETED: { bg: "#10B98120", text: "#10B981" },
  FAILED: { bg: "#EF444420", text: "#EF4444" },
  CANCELLED: { bg: "#EAB30820", text: "#EAB308" },
};

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  COVERED: { bg: "#10B98120", text: "#10B981", label: "Covered" },
  PARTIALLY_COVERED: { bg: "#EAB30820", text: "#EAB308", label: "Partial" },
  MISSING: { bg: "#EF444420", text: "#EF4444", label: "Missing" },
};

export function VerdictBadge({ status }: { status: string }) {
  const s = VERDICT_STYLES[status] || VERDICT_STYLES.MISSING;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

// ── Props ──

export interface ExperimentsListProps {
  onSelect: (exp: ClaimsExperiment) => void;
  onNewExperiment: () => void;
}

// ── Component ──

export function ExperimentsList({
  onSelect,
  onNewExperiment,
}: ExperimentsListProps) {
  const apiFetch = useAdminFetch();
  const [experiments, setExperiments] = useState<ClaimsExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadExperiments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<{ data: ClaimsExperiment[] }>(
        "/claims-benchmark/experiments"
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

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await apiFetch<void>(`/claims-benchmark/experiments/${id}`, {
          method: "DELETE",
        });
        setExperiments((prev) => prev.filter((e) => e.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
    },
    [apiFetch]
  );

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
            <Scale className="h-10 w-10 text-[#9CA3AF]/40" />
            <p className="text-[#9CA3AF] text-sm">No experiments yet</p>
            <p className="text-[#9CA3AF]/60 text-xs">
              Create your first claims benchmark experiment to compare extraction models
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
                <TableHead className="text-[#9CA3AF] text-xs">Models</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs w-48">
                  Progress
                </TableHead>
                <TableHead className="text-[#9CA3AF] text-xs">Created</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {experiments.map((exp) => {
                const isTerminal =
                  exp.status === "COMPLETED" ||
                  exp.status === "FAILED" ||
                  exp.status === "CANCELLED";
                return (
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
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {exp.config.models.map((m, i) => (
                          <Badge
                            key={`${m.modelId}-${m.provider}-${i}`}
                            className="bg-white/5 text-[#9CA3AF] text-[9px] font-mono"
                          >
                            {m.modelId}@{m.provider}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={exp.doneTasks}
                            max={exp.totalTasks}
                          />
                          <span className="text-[10px] text-[#9CA3AF] tabular-nums whitespace-nowrap">
                            {exp.doneTasks}/{exp.totalTasks}
                          </span>
                        </div>
                        {(exp.status === "JUDGING" ||
                          exp.status === "COMPLETED") &&
                          exp.totalJudgeTasks > 0 && (
                            <div className="flex items-center gap-2">
                              <ProgressBar
                                value={exp.doneJudgeTasks}
                                max={exp.totalJudgeTasks}
                                color="#8B5CF6"
                              />
                              <span className="text-[10px] text-[#9CA3AF] tabular-nums whitespace-nowrap">
                                {exp.doneJudgeTasks}/{exp.totalJudgeTasks}
                              </span>
                            </div>
                          )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[#9CA3AF] text-xs">
                      {relativeTime(exp.createdAt)}
                    </TableCell>
                    <TableCell>
                      {isTerminal && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent
                            className="bg-[#0F1D32] border-white/10 text-[#F9FAFB]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete experiment?</AlertDialogTitle>
                              <AlertDialogDescription className="text-[#9CA3AF]">
                                This will permanently delete "{exp.name}" and all
                                associated results and R2 data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-[#EF4444] hover:bg-[#DC2626] text-white"
                                onClick={() => handleDelete(exp.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
