import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFetch } from "@/lib/api-client";

interface FeedbackEntry {
  id: string;
  message: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    imageUrl: string | null;
  };
}

interface FeedbackResponse {
  data: FeedbackEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function FeedbackSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-48 bg-white/5" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}

export default function AdminFeedback() {
  const adminFetch = useAdminFetch();
  const [data, setData] = useState<FeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<FeedbackResponse>(
        `/feedback?page=${page}&pageSize=${pageSize}&sortField=createdAt&sortDir=desc`
      );
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [adminFetch, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await adminFetch(`/feedback/${id}`, { method: "DELETE" });
      load();
    } catch {
      // ignore
    }
  };

  if (loading && !data) return <FeedbackSkeleton />;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">User Feedback</h1>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} total
          </span>
        )}
      </div>

      {data && data.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No feedback yet.</p>
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
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">
              {entry.message}
            </p>
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
