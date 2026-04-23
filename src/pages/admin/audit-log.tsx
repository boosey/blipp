import { useState, useEffect } from "react";
import { useAdminFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorEmail?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

const PAGE_SIZE = 25;

export default function AdminAuditLog() {
  const adminFetch = useAdminFetch();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");

  useEffect(() => {
    loadEntries();
  }, [page, entityTypeFilter]);

  async function loadEntries() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (entityTypeFilter !== "all") params.set("entityType", entityTypeFilter);
      const data = await adminFetch<{
        data: AuditEntry[];
        total: number;
      }>(`/audit-log?${params}`);
      setEntries(data.data || []);
      setTotal(data.total || 0);
    } catch {
      toast.error("Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-[#3B82F6]" />
          <h1 className="text-lg font-semibold">Audit Log</h1>
        </div>
        <Select
          value={entityTypeFilter}
          onValueChange={(v) => {
            setEntityTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            <SelectItem value="all" className="text-xs">
              All types
            </SelectItem>
            <SelectItem value="Plan" className="text-xs">
              Plan
            </SelectItem>
            <SelectItem value="User" className="text-xs">
              User
            </SelectItem>
            <SelectItem value="PlatformConfig" className="text-xs">
              Config
            </SelectItem>
            <SelectItem value="PipelineJob" className="text-xs">
              Pipeline
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Entries */}
      {loading ? (
        <p className="text-[#9CA3AF] text-sm">Loading...</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <div
              key={e.id}
              className="bg-[#1A2942] border border-white/5 rounded-lg p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#F9FAFB]">
                  {e.action}
                </span>
                <span className="text-xs text-[#9CA3AF]">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                {e.entityType} &middot; {e.entityId?.slice(0, 12)}... &middot;
                by {e.actorEmail || e.actorId?.slice(0, 12)}
              </p>
              {(e.before || e.after) && (
                <div className="mt-2 text-xs font-mono bg-[#0F1D32] rounded p-2 max-h-20 overflow-auto">
                  {e.before && (
                    <div className="text-[#EF4444]">
                      - {JSON.stringify(e.before)}
                    </div>
                  )}
                  {e.after && (
                    <div className="text-[#10B981]">
                      + {JSON.stringify(e.after)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
              <ScrollText className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-sm">No audit entries</span>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 text-xs"
          >
            Prev
          </Button>
          <span className="text-xs text-[#9CA3AF]">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
            className="text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 text-xs"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
