import { useState, useEffect, useCallback } from "react";
import { LifeBuoy, Trash2, Check, RotateCcw, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFetch } from "@/lib/admin-api";

interface SupportEntry {
  id: string;
  name: string | null;
  email: string;
  subject: string;
  message: string;
  userAgent: string | null;
  status: "open" | "resolved";
  createdAt: string;
}

interface SupportResponse {
  data: SupportEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  openCount: number;
}

type StatusFilter = "open" | "resolved" | "all";

function SupportSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-48 bg-white/5" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-28 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}

export default function AdminSupport() {
  const adminFetch = useAdminFetch();
  const [data, setData] = useState<SupportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<StatusFilter>("open");
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<SupportResponse>(
        `/support?page=${page}&pageSize=${pageSize}&status=${filter}&sortField=createdAt&sortDir=desc`
      );
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

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const setStatus = async (id: string, status: "open" | "resolved") => {
    try {
      await adminFetch(`/support/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      load();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this support message?")) return;
    try {
      await adminFetch(`/support/${id}`, { method: "DELETE" });
      load();
    } catch {
      // ignore
    }
  };

  if (loading && !data) return <SupportSkeleton />;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <LifeBuoy className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Support Messages</h1>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} {filter === "all" ? "total" : filter} · {data.openCount} open
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 rounded-md border border-white/10 p-0.5">
          {(["open", "resolved", "all"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded capitalize transition-colors ${
                filter === f
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {data && data.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No messages.</p>
      )}

      <div className="space-y-3">
        {data?.data.map((entry) => (
          <div
            key={entry.id}
            className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {entry.subject}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      entry.status === "open"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-emerald-500/15 text-emerald-300"
                    }`}
                  >
                    {entry.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <a
                    href={`mailto:${entry.email}?subject=Re: ${encodeURIComponent(entry.subject)}`}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    <Mail className="h-3 w-3" />
                    {entry.name ? `${entry.name} <${entry.email}>` : entry.email}
                  </a>
                  <span>·</span>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {entry.status === "open" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-emerald-300 hover:text-emerald-200"
                    onClick={() => setStatus(entry.id, "resolved")}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Resolve
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setStatus(entry.id, "open")}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reopen
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(entry.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">
              {entry.message}
            </p>
            {entry.userAgent && (
              <p className="text-[10px] text-muted-foreground/60 font-mono truncate">
                {entry.userAgent}
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
