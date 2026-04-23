import { useState, useEffect } from "react";
import { useAdminFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AiErrorSummary {
  totalErrors: number;
  errorRate: { last1h: number; last24h: number };
  byProvider: Record<string, number>;
  topErrors: { message: string; count: number }[];
}

interface AiErrorEntry {
  id: string;
  provider: string;
  model: string;
  service: string;
  operation: string;
  category: string;
  severity: string;
  errorMessage: string;
  httpStatus?: number;
  requestDurationMs: number;
  timestamp: string;
}

export default function AdminAiErrors() {
  const adminFetch = useAdminFetch();
  const [summary, setSummary] = useState<AiErrorSummary | null>(null);
  const [errors, setErrors] = useState<AiErrorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceFilter, setServiceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    loadData();
  }, [serviceFilter, categoryFilter]);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "20" });
      if (serviceFilter !== "all") params.set("service", serviceFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);

      const [summaryData, errorsData] = await Promise.all([
        adminFetch<{ data: AiErrorSummary }>("/ai-errors/summary"),
        adminFetch<{ data: AiErrorEntry[] }>(`/ai-errors?${params}`),
      ]);
      setSummary(summaryData.data);
      setErrors(errorsData.data || []);
    } catch {
      toast.error("Failed to load AI errors");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-[#F59E0B]" />
        <h1 className="text-lg font-semibold">AI Service Errors</h1>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-[#1A2942] border border-white/5 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[#F9FAFB]">
              {summary.totalErrors}
            </p>
            <p className="text-xs text-[#9CA3AF]">Last 24h</p>
          </div>
          <div className="bg-[#1A2942] border border-white/5 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[#F9FAFB]">
              {summary.errorRate?.last1h ?? 0}
            </p>
            <p className="text-xs text-[#9CA3AF]">Last 1h</p>
          </div>
          <div className="bg-[#1A2942] border border-white/5 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[#F9FAFB]">
              {Object.keys(summary.byProvider || {}).length}
            </p>
            <p className="text-xs text-[#9CA3AF]">Providers</p>
          </div>
          <div className="bg-[#1A2942] border border-white/5 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[#F9FAFB]">
              {summary.topErrors?.length ?? 0}
            </p>
            <p className="text-xs text-[#9CA3AF]">Unique Errors</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-40 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            <SelectValue placeholder="All services" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            <SelectItem value="all" className="text-xs">
              All services
            </SelectItem>
            <SelectItem value="stt" className="text-xs">
              STT
            </SelectItem>
            <SelectItem value="distillation" className="text-xs">
              Distillation
            </SelectItem>
            <SelectItem value="narrative" className="text-xs">
              Narrative
            </SelectItem>
            <SelectItem value="tts" className="text-xs">
              TTS
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            <SelectItem value="all" className="text-xs">
              All categories
            </SelectItem>
            <SelectItem value="rate_limit" className="text-xs">
              Rate Limit
            </SelectItem>
            <SelectItem value="timeout" className="text-xs">
              Timeout
            </SelectItem>
            <SelectItem value="auth" className="text-xs">
              Auth
            </SelectItem>
            <SelectItem value="server_error" className="text-xs">
              Server Error
            </SelectItem>
            <SelectItem value="network" className="text-xs">
              Network
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error list */}
      {loading ? (
        <p className="text-[#9CA3AF] text-sm">Loading...</p>
      ) : (
        <div className="space-y-1.5">
          {errors.map((e) => (
            <div
              key={e.id}
              className="bg-[#1A2942] border border-white/5 rounded-lg p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      e.severity === "transient"
                        ? "bg-[#F59E0B]/10 text-[#F59E0B]"
                        : "bg-[#EF4444]/10 text-[#EF4444]"
                    }`}
                  >
                    {e.category}
                  </span>
                  <span className="text-sm text-[#F9FAFB]">
                    {e.provider}/{e.model}
                  </span>
                </div>
                <span className="text-xs text-[#9CA3AF]">
                  {new Date(e.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-1 truncate">
                {e.errorMessage}
              </p>
              <p className="text-[10px] text-[#9CA3AF]/60 mt-0.5 font-mono">
                {e.service} &middot; {e.operation} &middot;{" "}
                {e.requestDurationMs}ms
                {e.httpStatus ? ` · HTTP ${e.httpStatus}` : ""}
              </p>
            </div>
          ))}
          {errors.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
              <AlertTriangle className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-sm">No errors found</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
