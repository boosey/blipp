import { useState, useEffect } from "react";
import { useAdminFetch } from "@/lib/admin-api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, ChevronLeft, ChevronRight } from "lucide-react";

interface GeoProfile {
  id: string;
  city: string;
  state: string;
  scope: string;
  confidence: number;
  source: string;
  podcast: { id: string; title: string; imageUrl: string | null; categories: string[] };
  team: { id: string; name: string; nickname: string } | null;
}

interface GeoStats {
  totalProfiles: number;
  bySource: Record<string, number>;
  byScope: Record<string, number>;
  topStates: { state: string; count: number }[];
  unprocessed: number;
}

interface CronRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: string;
  result: Record<string, any> | null;
  errorMessage: string | null;
}

export default function AdminGeoTagging() {
  const adminFetch = useAdminFetch();
  const [profiles, setProfiles] = useState<GeoProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<GeoStats | null>(null);
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [stateFilter, setStateFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const pageSize = 20;

  useEffect(() => {
    loadData();
  }, [page, stateFilter, sourceFilter, scopeFilter, search]);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (stateFilter) params.set("state", stateFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (scopeFilter !== "all") params.set("scope", scopeFilter);
      if (search) params.set("search", search);

      const [profilesData, statsData, runsData] = await Promise.all([
        adminFetch<{ data: GeoProfile[]; total: number }>(`/geo-tagging?${params}`),
        adminFetch<{ data: GeoStats }>("/geo-tagging/stats"),
        adminFetch<{ data: CronRun[] }>("/geo-tagging/costs"),
      ]);

      setProfiles(profilesData.data);
      setTotal(profilesData.total);
      setStats(statsData.data);
      setRuns(runsData.data);
    } catch {
      toast.error("Failed to load geo-tagging data");
    } finally {
      setLoading(false);
    }
  }

  async function deleteProfile(id: string) {
    try {
      await adminFetch(`/geo-tagging/${id}`, { method: "DELETE" });
      toast.success("Profile deleted");
      loadData();
    } catch {
      toast.error("Failed to delete profile");
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Profiles" value={stats.totalProfiles} />
          <StatCard label="Unprocessed" value={stats.unprocessed} />
          <StatCard label="Keyword" value={stats.bySource.keyword ?? 0} />
          <StatCard label="LLM" value={stats.bySource.llm ?? 0} />
        </div>
      )}

      {/* Scope breakdown */}
      {stats && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(stats.byScope).map(([scope, count]) => (
            <Badge key={scope} variant="outline" className="text-xs">
              {scope}: {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Recent cron runs with cost tracking */}
      {runs.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Recent Cron Runs</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Processed</TableHead>
                  <TableHead>Pass 1</TableHead>
                  <TableHead>Pass 2</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(run.startedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={run.status === "SUCCESS" ? "default" : run.status === "FAILED" ? "destructive" : "secondary"} className="text-[10px]">
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}</TableCell>
                    <TableCell className="text-xs">{run.result?.processed ?? "—"}</TableCell>
                    <TableCell className="text-xs">{run.result?.pass1Matched ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {run.result?.pass2Matched ?? "—"}/{run.result?.pass2Attempted ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {run.result?.totalInputTokens != null
                        ? `${((run.result.totalInputTokens + (run.result.totalOutputTokens ?? 0)) / 1000).toFixed(1)}k`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {run.result?.totalCost != null ? `$${run.result.totalCost.toFixed(4)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Top states */}
      {stats && stats.topStates.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Top States</h2>
          <div className="flex gap-2 flex-wrap">
            {stats.topStates.map((s: any) => (
              <button
                key={s.state}
                onClick={() => { setStateFilter(s.state); setPage(1); }}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  stateFilter === s.state
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {s.state} ({s.count})
              </button>
            ))}
            {stateFilter && (
              <button
                onClick={() => { setStateFilter(""); setPage(1); }}
                className="text-xs px-2 py-1 rounded-full text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <Input
          placeholder="Search podcast title..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-60"
        />
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="keyword">Keyword</SelectItem>
            <SelectItem value="llm">LLM</SelectItem>
          </SelectContent>
        </Select>
        <Select value={scopeFilter} onValueChange={(v) => { setScopeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="city">City</SelectItem>
            <SelectItem value="state">State</SelectItem>
            <SelectItem value="regional">Regional</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Profiles table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Podcast</TableHead>
              <TableHead>City</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && profiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading...</TableCell>
              </TableRow>
            ) : profiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No geo profiles found</TableCell>
              </TableRow>
            ) : (
              profiles.map((gp) => (
                <TableRow key={gp.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {gp.podcast.imageUrl && (
                        <img src={gp.podcast.imageUrl} className="w-8 h-8 rounded object-cover flex-shrink-0" alt="" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate max-w-[200px]">{gp.podcast.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {gp.podcast.categories.join(", ")}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{gp.city || "—"}</TableCell>
                  <TableCell className="text-sm">{gp.state}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{gp.scope}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm font-mono ${gp.confidence >= 0.9 ? "text-green-400" : gp.confidence >= 0.7 ? "text-yellow-400" : "text-red-400"}`}>
                      {gp.confidence.toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={gp.source === "llm" ? "default" : "secondary"} className="text-[10px]">
                      {gp.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{gp.team?.nickname ?? "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteProfile(gp.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} profiles total</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value.toLocaleString()}</p>
    </div>
  );
}
