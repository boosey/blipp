import { useState, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeTime } from "@/lib/admin-formatters";
import type { ActiveIssue } from "@/types/admin";
import { severityColor, summarizeIssue, humanizeTitle } from "./utils";

function IssueCard({ issue, onRetry, onDismiss, onDoubleClick }: {
  issue: ActiveIssue;
  onRetry: (issue: ActiveIssue) => Promise<void>;
  onDismiss: (issue: ActiveIssue) => void;
  onDoubleClick?: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const sc = severityColor(issue.severity);

  const { summary, rawDetails } = useMemo(() => {
    if (issue.rawError) {
      return { summary: issue.description, rawDetails: issue.rawError };
    }
    const { summary: s, rawJson } = summarizeIssue(issue.description);
    return { summary: s, rawDetails: rawJson };
  }, [issue.description, issue.rawError]);

  const title = useMemo(() => humanizeTitle(issue.title), [issue.title]);

  return (
    <div
      className={cn("rounded-md border p-3 space-y-2", sc.bg, sc.border, onDoubleClick && "cursor-pointer")}
      onDoubleClick={onDoubleClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge className={cn("text-[10px] uppercase font-bold shrink-0", sc.bg, sc.text)}>
            {issue.severity}
          </Badge>
          <span className="text-xs font-medium truncate">{title}</span>
        </div>
        <span className="text-[10px] text-[#9CA3AF] font-mono shrink-0">
          {relativeTime(issue.createdAt)}
        </span>
      </div>
      <p className="text-[11px] text-[#9CA3AF] leading-relaxed line-clamp-3">{summary}</p>
      {rawDetails && (
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-[#3B82F6] hover:text-[#60A5FA] transition-colors"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", showDetails && "rotate-180")} />
          {showDetails ? "Hide" : "Show"} raw details
        </button>
      )}
      {showDetails && rawDetails && (
        <pre className="text-[10px] text-[#9CA3AF]/70 bg-black/20 rounded p-2 overflow-x-auto max-h-32 overflow-y-auto font-mono whitespace-pre-wrap break-all">
          {(() => {
            try {
              return JSON.stringify(JSON.parse(rawDetails), null, 2);
            } catch {
              return rawDetails;
            }
          })()}
        </pre>
      )}
      {issue.actionable && (
        <div className="flex gap-2">
          <Button
            size="xs"
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-[10px]"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                await onRetry(issue);
              } finally {
                setRetrying(false);
              }
            }}
          >
            {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {retrying ? "Retrying..." : "Retry"}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="text-[#9CA3AF] hover:text-[#F9FAFB] text-[10px]"
            onClick={() => onDismiss(issue)}
          >
            <XCircle className="h-3 w-3" /> Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

export interface ActiveIssuesWidgetProps {
  issues: ActiveIssue[];
  loading: boolean;
  onRetry: (issue: ActiveIssue) => Promise<void>;
  onDismiss: (issue: ActiveIssue) => void;
  onDismissAll: () => void;
  onNavToJob: (requestId?: string, jobId?: string) => void;
}

export function ActiveIssuesWidget({ issues, loading, onRetry, onDismiss, onDismissAll, onNavToJob }: ActiveIssuesWidgetProps) {
  return (
    <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 flex flex-col overflow-hidden">
      <div className="widget-drag-handle flex items-center justify-between p-4 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#EF4444]" />
          <span className="text-sm font-semibold">Active Issues</span>
          {issues.length > 0 && (
            <Badge className="bg-[#EF4444]/15 text-[#EF4444] text-[10px] ml-1">{issues.length}</Badge>
          )}
        </div>
        {issues.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10 text-xs gap-1"
            onClick={onDismissAll}
          >
            <XCircle className="h-3 w-3" /> Dismiss All
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1 min-h-0 px-4 pb-3">
        {issues.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
            <CheckCircle2 className="h-8 w-8 mb-2 text-[#10B981] opacity-60" />
            <span className="text-sm font-medium text-[#10B981]">No active issues</span>
            <span className="text-xs text-[#9CA3AF] mt-1">All systems running smoothly</span>
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onRetry={onRetry}
                onDismiss={onDismiss}
                onDoubleClick={issue.jobId && issue.requestId ? () => onNavToJob(issue.requestId, issue.jobId) : undefined}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
