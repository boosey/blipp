import { useState, useEffect, useCallback } from "react";
import { ThumbsDown, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFetch } from "@/lib/admin-api";

interface BlippFeedbackEntry {
  id: string;
  reasons: string[];
  message: string | null;
  isTechnicalFailure: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    imageUrl: string | null;
  };
  episode: {
    id: string;
    title: string;
  };
}

interface BlippFeedbackResponse {
  data: BlippFeedbackEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const REASON_LABELS: Record<string, string> = {
  blipp_failed: "Blipp failed",
  missed_key_points: "Missed key points",
  inaccurate: "Inaccurate info",
  too_short: "Too short",
  too_long: "Too long",
  poor_audio: "Poor audio quality",
  not_interesting: "Not interesting",
};

function BlippFeedbackSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-48 bg-white/5" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-28 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}

export default function AdminBlippFeedback() {
  const adminFetch = useAdminFetch();
  const [data, setData] = useState<BlippFeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "technical" | "content">("all");
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/blipp-feedback?page=${page}&pageSize=${pageSize}&sortField=createdAt&sortDir=desc`;
      if (filter === "technical") url += "&isTechnicalFailure=true";
      else if (filter === "content") url += "&isTechnicalFailure=false";
      const res = await adminFetch<BlippFeedbackResponse>(url);
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [adminFetch, page, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await adminFetch(`/blipp-feedback/${id}`, { method: "DELETE" });
      load();
    } catch {
      // ignore
    }
  };

  if (loading && !data) return <BlippFeedbackSkeleton />;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ThumbsDown className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Blipp Feedback</h1>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} total
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {(["all", "technical", "content"] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : f === "technical" ? "Technical failures" : "Content feedback"}
          </button>
        ))}
      </div>

      {data && data.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No blipp feedback yet.</p>
      )}

      <div className="space-y-3">
        {data?.data.map((entry) => (
          <div
            key={entry.id}
            className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {entry.user.imageUrl && (
                  <img
                    src={entry.user.imageUrl}
                    alt=""
                    className="h-6 w-6 rounded-full"
                  />
                )}
                <span className="text-sm font-medium">
                  {entry.user.name || entry.user.email}
                </span>
                {entry.isTechnicalFailure && (
                  <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="h-3 w-3" />
                    Technical
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(entry.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              Episode: {entry.episode.title}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {entry.reasons.map((r) => (
                <span
                  key={r}
                  className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
                >
                  {REASON_LABELS[r] ?? r}
                </span>
              ))}
            </div>
            {entry.message && (
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                {entry.message}
              </p>
            )}
          </div>
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
