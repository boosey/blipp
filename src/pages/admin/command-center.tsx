import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Responsive, WidthProvider, type Layout, type ResponsiveLayouts } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { RefreshCw, Lock, Unlock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFetch } from "@/lib/admin-api";
import { usePipelineConfig } from "@/hooks/use-pipeline-config";
import { PipelineControls } from "@/components/admin/pipeline-controls";
import { FeedRefreshCard } from "@/components/admin/feed-refresh-card";
import type { SystemHealth, DashboardStats, CostSummary, ActivityEvent, ActiveIssue } from "@/types/admin";
import { SystemHealthWidget } from "@/components/admin/command-center/system-health-widget";
import { PipelinePulseWidget } from "@/components/admin/command-center/pipeline-pulse-widget";
import { ActiveIssuesWidget } from "@/components/admin/command-center/active-issues-widget";
import { RecentActivityWidget } from "@/components/admin/command-center/recent-activity-widget";
import { CostMonitorWidget } from "@/components/admin/command-center/cost-monitor-widget";
import { QuickStatsWidget } from "@/components/admin/command-center/quick-stats-widget";

// ── Grid Layout Setup ──

const GridLayout = WidthProvider(Responsive);

const LAYOUT_KEY = "blipp-cc-layout";
const ROW_H = 50;
const MARGINS: [number, number] = [12, 12];
const COLS = { lg: 12, md: 10, sm: 6, xs: 1 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 0 };

const DEFAULT_LO: ResponsiveLayouts = {
  lg: [
    { i: "system-health",     x: 0, y: 0,  w: 5, h: 5, minW: 3, minH: 3 },
    { i: "pipeline-pulse",    x: 0, y: 5,  w: 5, h: 8, minW: 3, minH: 4 },
    { i: "active-issues",     x: 5, y: 0,  w: 4, h: 9, minW: 3, minH: 4 },
    { i: "recent-activity",   x: 5, y: 9,  w: 4, h: 4, minW: 2, minH: 3 },
    { i: "feed-refresh",      x: 9, y: 0,  w: 3, h: 3, minW: 2, minH: 2 },
    { i: "pipeline-controls", x: 9, y: 3,  w: 3, h: 5, minW: 2, minH: 3 },
    { i: "cost-monitor",      x: 9, y: 8,  w: 3, h: 5, minW: 2, minH: 3 },
    { i: "quick-stats",       x: 9, y: 13, w: 3, h: 3, minW: 2, minH: 2 },
  ],
};

function getSavedLayouts(): ResponsiveLayouts {
  try {
    const s = localStorage.getItem(LAYOUT_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return DEFAULT_LO;
}

const GRID_CSS = `
  .react-grid-item > .react-resizable-handle::after {
    border-right: 2px solid rgba(255, 255, 255, 0.15) !important;
    border-bottom: 2px solid rgba(255, 255, 255, 0.15) !important;
  }
  .react-grid-placeholder {
    background: rgba(59, 130, 246, 0.1) !important;
    border: 1px dashed rgba(59, 130, 246, 0.3) !important;
    border-radius: 0.5rem;
  }
  .cc-edit .widget-drag-handle { cursor: grab; }
  .cc-edit .widget-drag-handle:active { cursor: grabbing; }
`;

function CommandCenterSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[5fr_3fr_2fr] gap-4 h-full">
      <div className="space-y-4">
        <Skeleton className="h-48 bg-white/5 rounded-lg" />
        <Skeleton className="h-96 bg-white/5 rounded-lg" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-64 bg-white/5 rounded-lg" />
        <Skeleton className="h-80 bg-white/5 rounded-lg" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-48 bg-white/5 rounded-lg" />
        <Skeleton className="h-52 bg-white/5 rounded-lg" />
        <Skeleton className="h-40 bg-white/5 rounded-lg" />
      </div>
    </div>
  );
}

// ── Main ──

export default function CommandCenter() {
  const navigate = useNavigate();
  const apiFetch = useAdminFetch();
  const pipeline = usePipelineConfig();

  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [issues, setIssues] = useState<ActiveIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [lo, setLo] = useState<ResponsiveLayouts>(getSavedLayouts);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ data: SystemHealth }>("/dashboard").then((r) => setHealth(r.data)).catch(console.error),
      apiFetch<{ data: DashboardStats }>("/dashboard/stats").then((r) => setStats(r.data)).catch(console.error),
      apiFetch<{ data: CostSummary }>("/dashboard/costs").then((r) => setCost(r.data)).catch(console.error),
      apiFetch<{ data: ActivityEvent[] }>("/dashboard/activity").then((r) => setEvents(r.data)).catch(console.error),
      apiFetch<{ data: ActiveIssue[] }>("/dashboard/issues").then((r) => setIssues(r.data)).catch(console.error),
    ]).finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const handleIssueRetry = useCallback(
    async (issue: ActiveIssue) => {
      try {
        if (issue.entityType === "episode" && issue.entityId) {
          await apiFetch(`/pipeline/trigger/episode/${issue.entityId}`, { method: "POST" });
        } else if (issue.entityType === "podcast" && issue.entityId) {
          await apiFetch(`/podcasts/${issue.entityId}/refresh`, { method: "POST" });
        } else {
          await apiFetch("/pipeline/trigger/feed-refresh", { method: "POST" });
        }
        load();
      } catch (e) {
        console.error("Issue retry failed:", e);
      }
    },
    [apiFetch, load]
  );

  const handleIssueDismiss = useCallback(
    async (issue: ActiveIssue) => {
      const prev = issues;
      setIssues((cur) => cur.filter((i) => i.id !== issue.id));
      if (issue.jobId) {
        try {
          await apiFetch(`/pipeline/jobs/${issue.jobId}/dismiss`, { method: "PATCH" });
        } catch {
          setIssues(prev);
          toast.error("Failed to dismiss issue");
        }
      }
    },
    [apiFetch, issues]
  );

  const handleDismissAll = useCallback(async () => {
    const prev = issues;
    setIssues([]);
    try {
      await apiFetch("/pipeline/jobs/bulk-dismiss", { method: "PATCH" });
    } catch {
      setIssues(prev);
      toast.error("Failed to dismiss all issues");
    }
  }, [apiFetch, issues]);

  const navToJob = useCallback(
    (requestId?: string, jobId?: string) => {
      if (jobId && requestId) navigate(`/admin/requests?requestId=${requestId}&jobId=${jobId}`);
    },
    [navigate]
  );

  const onLoChange = useCallback((_cur: Layout, all: ResponsiveLayouts) => {
    setLo(all);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(all)); } catch { /* ignore */ }
  }, []);

  const resetLo = useCallback(() => {
    setLo(DEFAULT_LO);
    localStorage.removeItem(LAYOUT_KEY);
  }, []);

  if (loading && !health) return <CommandCenterSkeleton />;

  return (
    <>
      <style>{GRID_CSS}</style>

      <div className="flex items-center justify-between mb-2">
        <div>
          {editing && (
            <span className="text-xs text-[#9CA3AF]">
              Drag headers to rearrange, resize from corners
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-xs" onClick={load} className="text-[#9CA3AF] hover:text-[#F9FAFB]">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {editing && (
            <Button variant="ghost" size="sm" onClick={resetLo} className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
          <Button
            variant={editing ? "default" : "ghost"}
            size="sm"
            onClick={() => setEditing(!editing)}
            className={cn(
              "text-xs gap-1",
              editing ? "bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white" : "text-[#9CA3AF] hover:text-[#F9FAFB]"
            )}
          >
            {editing ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {editing ? "Lock Layout" : "Customize"}
          </Button>
        </div>
      </div>

      <div className={editing ? "cc-edit" : ""}>
        <GridLayout
          layouts={lo}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_H}
          margin={MARGINS}
          isDraggable={editing}
          isResizable={editing}
          draggableHandle=".widget-drag-handle"
          draggableCancel="button, a, input, select, textarea"
          onLayoutChange={onLoChange}
          compactType="vertical"
        >
          <div key="system-health"><SystemHealthWidget health={health} /></div>
          <div key="pipeline-pulse"><PipelinePulseWidget events={events} loading={loading} onNavToJob={navToJob} /></div>
          <div key="active-issues"><ActiveIssuesWidget issues={issues} loading={loading} onRetry={handleIssueRetry} onDismiss={handleIssueDismiss} onDismissAll={handleDismissAll} onNavToJob={navToJob} /></div>
          <div key="recent-activity"><RecentActivityWidget events={events} /></div>
          <div key="feed-refresh"><FeedRefreshCard className="h-full overflow-auto" /></div>
          <div key="pipeline-controls">
            {pipeline.loading ? (
              <Skeleton className="h-full bg-white/5 rounded-lg" />
            ) : (
              <PipelineControls
                variant="full"
                className="h-full overflow-auto"
                config={pipeline.config}
                saving={pipeline.saving}
                onTogglePipeline={pipeline.togglePipeline}
                onToggleStage={pipeline.toggleStage}
              />
            )}
          </div>
          <div key="cost-monitor"><CostMonitorWidget cost={cost} /></div>
          <div key="quick-stats"><QuickStatsWidget stats={stats} /></div>
        </GridLayout>
      </div>
    </>
  );
}
