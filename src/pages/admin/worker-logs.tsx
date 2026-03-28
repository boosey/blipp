import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAdminFetch } from "@/lib/admin-api";
import { toast } from "sonner";
import { Terminal, Play, Save, Trash2, ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// --- Types ---

interface QueryTemplate {
  id: string;
  name: string;
  description: string;
  query: Record<string, any>;
  variables: { name: string; label: string; type: "string" | "timestamp"; default?: string }[];
}

interface FilterRow {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface LogEvent {
  Timestamp: string;
  $workers_observability_level?: string;
  [key: string]: any;
}

const OPERATORS = [
  { value: "eq", label: "=" },
  { value: "neq", label: "!=" },
  { value: "includes", label: "includes" },
  { value: "not_includes", label: "not includes" },
  { value: "starts_with", label: "starts with" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "exists", label: "exists" },
  { value: "regex", label: "regex" },
];

const LEVEL_COLORS: Record<string, string> = {
  info: "bg-green-500/15 text-green-400",
  log: "bg-green-500/15 text-green-400",
  warn: "bg-yellow-500/15 text-yellow-400",
  warning: "bg-yellow-500/15 text-yellow-400",
  error: "bg-red-500/15 text-red-400",
  debug: "bg-white/10 text-[#9CA3AF]",
};

let filterIdCounter = 0;
function newFilterRow(): FilterRow {
  return { id: String(++filterIdCounter), field: "", operator: "eq", value: "" };
}

export default function AdminWorkerLogs() {
  const adminFetch = useAdminFetch();
  const [searchParams, setSearchParams] = useSearchParams();

  // Templates
  const [templates, setTemplates] = useState<QueryTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    searchParams.get("template") || ""
  );

  // Keys
  const [fieldKeys, setFieldKeys] = useState<string[]>([]);

  // Variables
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // Filter builder
  const [filters, setFilters] = useState<FilterRow[]>([newFilterRow()]);
  const [filterLogic, setFilterLogic] = useState<"AND" | "OR">("AND");

  // Raw JSON
  const [rawJson, setRawJson] = useState("{}");
  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const [rawJsonEdited, setRawJsonEdited] = useState(false);

  // Results
  const [results, setResults] = useState<LogEvent[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryDurationMs, setQueryDurationMs] = useState<number | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Save template form
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateDesc, setSaveTemplateDesc] = useState("");

  const autoExecuted = useRef(false);

  // Load templates and keys on mount
  useEffect(() => {
    adminFetch<{ templates: QueryTemplate[] }>("/worker-logs/templates")
      .then((d) => setTemplates(d.templates || []))
      .catch(() => {});
    adminFetch<{ keys: string[] }>("/worker-logs/keys")
      .then((d) => setFieldKeys(d.keys || []))
      .catch(() => {});
  }, []);

  // When template selection changes, populate variables from URL params
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  useEffect(() => {
    if (!selectedTemplate) return;
    const vals: Record<string, string> = {};
    for (const v of selectedTemplate.variables) {
      vals[v.name] = searchParams.get(v.name) || v.default || "";
    }
    setVariableValues(vals);
    setRawJsonEdited(false);
  }, [selectedTemplateId, templates]);

  // Build resolved query from template + variables or filter builder
  const buildQuery = useCallback((): Record<string, any> => {
    if (rawJsonEdited) {
      try { return JSON.parse(rawJson); } catch { return {}; }
    }
    if (selectedTemplate) {
      // First pass: string replacement for non-timestamp variables
      let jsonStr = JSON.stringify(selectedTemplate.query);
      for (const v of selectedTemplate.variables) {
        if (v.type === "timestamp") continue;
        const val = variableValues[v.name] || v.default || "";
        jsonStr = jsonStr.replaceAll(`{{${v.name}}}`, val);
      }
      // Parse, then set timestamp values as numbers (not strings)
      try {
        const query = JSON.parse(jsonStr);
        for (const v of selectedTemplate.variables) {
          if (v.type !== "timestamp") continue;
          const val = variableValues[v.name] || v.default || "";
          const resolved = resolveTimestamp(val);
          // Walk the query and replace any remaining "{{name}}" string with the number
          const placeholder = `{{${v.name}}}`;
          JSON.stringify(query, (_key, value) => {
            if (value === placeholder) return resolved;
            return value;
          });
          // Direct replacement for known timeframe location
          if (query.timeframe?.from === placeholder) query.timeframe.from = resolved;
          if (query.timeframe?.to === placeholder) query.timeframe.to = resolved;
        }
        return query;
      } catch { return {}; }
    }
    // Build from filter rows
    const validFilters = filters.filter((f) => f.field && f.value);
    if (validFilters.length === 0) return {};
    const conditions = validFilters.map((f) => ({
      key: f.field,
      operation: f.operator,
      value: f.value,
    }));
    return {
      filters: conditions,
      filterLogic: filterLogic.toLowerCase(),
      limit: 100,
    };
  }, [rawJsonEdited, rawJson, selectedTemplate, variableValues, filters, filterLogic]);

  // Sync raw JSON display
  useEffect(() => {
    if (!rawJsonEdited) {
      setRawJson(JSON.stringify(buildQuery(), null, 2));
    }
  }, [buildQuery, rawJsonEdited]);

  // Auto-execute on mount if template + variables present
  useEffect(() => {
    if (autoExecuted.current) return;
    if (!selectedTemplate) return;
    const hasVars = selectedTemplate.variables.length > 0;
    const hasValues = selectedTemplate.variables.some((v) => searchParams.get(v.name));
    if (hasVars && hasValues) {
      autoExecuted.current = true;
      executeQuery();
    }
  }, [selectedTemplate]);

  function resolveTimestamp(val: string): number {
    if (val === "now" || !val) return Date.now();
    const relMatch = val.match(/^-(\d+)(m|h|d)$/);
    if (relMatch) {
      const n = parseInt(relMatch[1]);
      const unit = relMatch[2];
      const ms = unit === "m" ? n * 60000 : unit === "h" ? n * 3600000 : n * 86400000;
      return Date.now() - ms;
    }
    // Try parsing as date string
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? Date.now() : parsed;
  }

  async function executeQuery() {
    const query = buildQuery();
    setQueryLoading(true);
    setResults([]);
    setExpandedRow(null);
    setQueryDurationMs(null);
    const start = performance.now();
    try {
      const data = await adminFetch<{ data: LogEvent[] }>("/worker-logs/query", {
        method: "POST",
        body: JSON.stringify(query),
      });
      setResults(data.data || []);
      setQueryDurationMs(Math.round(performance.now() - start));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Query failed");
      setQueryDurationMs(Math.round(performance.now() - start));
    } finally {
      setQueryLoading(false);
    }
  }

  async function saveTemplate() {
    if (!saveTemplateName.trim()) return;
    try {
      const query = buildQuery();
      const newTemplate: QueryTemplate = {
        id: crypto.randomUUID(),
        name: saveTemplateName.trim(),
        description: saveTemplateDesc.trim(),
        query,
        variables: [],
      };
      const updated = [...templates, newTemplate];
      await adminFetch("/worker-logs/templates", {
        method: "PUT",
        body: JSON.stringify({ templates: updated }),
      });
      setTemplates(updated);
      setShowSaveForm(false);
      setSaveTemplateName("");
      setSaveTemplateDesc("");
      toast.success("Template saved");
    } catch {
      toast.error("Failed to save template");
    }
  }

  async function deleteTemplate(id: string) {
    const updated = templates.filter((t) => t.id !== id);
    try {
      await adminFetch("/worker-logs/templates", {
        method: "PUT",
        body: JSON.stringify({ templates: updated }),
      });
      setTemplates(updated);
      if (selectedTemplateId === id) setSelectedTemplateId("");
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    }
  }

  function extractEventFields(event: LogEvent) {
    const level = (event.$workers_observability_level || event.Level || "info").toLowerCase();
    const ts = event.Timestamp || event.timestamp || "";
    const message = event.Message || event.message || event.$workers_observability_message || "";
    const stage = event.stage || event.Stage || "";
    const action = event.action || event.Action || "";
    return { level, ts, message, stage, action };
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Terminal className="h-5 w-5 text-[#3B82F6]" />
        <h1 className="text-lg font-semibold">Worker Logs</h1>
      </div>

      {/* Query Input Area */}
      <div className="bg-[#1A2942] border border-white/5 rounded-lg p-4 space-y-3">
        {/* Template selector */}
        <div className="flex items-center gap-2">
          <Select
            value={selectedTemplateId || "__custom__"}
            onValueChange={(v) => {
              const id = v === "__custom__" ? "" : v;
              setSelectedTemplateId(id);
              setRawJsonEdited(false);
              if (id) {
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("template", id);
                  return next;
                });
              }
            }}
          >
            <SelectTrigger className="w-64 h-8 text-xs bg-[#0F1D32] border-white/10 text-[#F9FAFB]">
              <SelectValue placeholder="Select a template..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              <SelectItem value="__custom__" className="text-xs">
                Custom Query
              </SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedTemplate && (
            <button
              onClick={() => deleteTemplate(selectedTemplate.id)}
              className="p-1 rounded hover:bg-white/5 text-[#9CA3AF] hover:text-red-400"
              title="Delete template"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Variables bar */}
        {selectedTemplate && selectedTemplate.variables.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedTemplate.variables.map((v) => (
              <div key={v.name} className="flex items-center gap-1">
                <label className="text-[10px] text-[#9CA3AF] uppercase tracking-wider">
                  {v.label}
                </label>
                <Input
                  value={variableValues[v.name] || ""}
                  onChange={(e) =>
                    setVariableValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                  }
                  placeholder={v.type === "timestamp" ? "-1h, -24h, now, or ISO" : ""}
                  className="h-7 w-44 text-xs bg-[#0F1D32] border-white/10 text-[#F9FAFB] placeholder:text-[#9CA3AF]/40"
                />
              </div>
            ))}
          </div>
        )}

        {/* Filter builder (custom mode) */}
        {!selectedTemplateId && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] text-[#9CA3AF] uppercase tracking-wider">
              <span>Filters</span>
              <button
                onClick={() => setFilterLogic((p) => (p === "AND" ? "OR" : "AND"))}
                className="px-1.5 py-0.5 rounded bg-[#3B82F6]/15 text-[#3B82F6] font-medium hover:bg-[#3B82F6]/25"
              >
                {filterLogic}
              </button>
            </div>
            {filters.map((f, i) => (
              <div key={f.id} className="flex items-center gap-1.5">
                <Select
                  value={f.field || "__none__"}
                  onValueChange={(v) => {
                    const updated = [...filters];
                    updated[i] = { ...f, field: v === "__none__" ? "" : v };
                    setFilters(updated);
                    setRawJsonEdited(false);
                  }}
                >
                  <SelectTrigger className="w-48 h-7 text-xs bg-[#0F1D32] border-white/10 text-[#F9FAFB]">
                    <SelectValue placeholder="Field..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB] max-h-60">
                    <SelectItem value="__none__" className="text-xs">
                      Field...
                    </SelectItem>
                    {fieldKeys.map((k) => (
                      <SelectItem key={k} value={k} className="text-xs font-mono">
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={f.operator}
                  onValueChange={(v) => {
                    const updated = [...filters];
                    updated[i] = { ...f, operator: v };
                    setFilters(updated);
                    setRawJsonEdited(false);
                  }}
                >
                  <SelectTrigger className="w-32 h-7 text-xs bg-[#0F1D32] border-white/10 text-[#F9FAFB]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                    {OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value} className="text-xs">
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={f.value}
                  onChange={(e) => {
                    const updated = [...filters];
                    updated[i] = { ...f, value: e.target.value };
                    setFilters(updated);
                    setRawJsonEdited(false);
                  }}
                  placeholder="Value..."
                  className="h-7 flex-1 text-xs bg-[#0F1D32] border-white/10 text-[#F9FAFB] placeholder:text-[#9CA3AF]/40"
                />

                <button
                  onClick={() => {
                    if (filters.length > 1) {
                      setFilters(filters.filter((_, j) => j !== i));
                    }
                  }}
                  className="p-1 text-[#9CA3AF] hover:text-red-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setFilters([...filters, newFilterRow()])}
              className="flex items-center gap-1 text-xs text-[#3B82F6] hover:text-[#3B82F6]/80"
            >
              <Plus className="h-3 w-3" /> Add filter
            </button>
          </div>
        )}

        {/* Raw JSON editor */}
        <div>
          <button
            onClick={() => setRawJsonOpen(!rawJsonOpen)}
            className="flex items-center gap-1 text-[10px] text-[#9CA3AF] uppercase tracking-wider hover:text-[#F9FAFB]"
          >
            {rawJsonOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Raw JSON
            {rawJsonEdited && (
              <span className="ml-1 text-[#F59E0B] normal-case tracking-normal">(edited)</span>
            )}
          </button>
          {rawJsonOpen && (
            <textarea
              value={rawJson}
              onChange={(e) => {
                setRawJson(e.target.value);
                setRawJsonEdited(true);
              }}
              rows={8}
              className="mt-1 w-full rounded bg-[#0F1D32] border border-white/10 text-xs font-mono text-[#F9FAFB] p-2 resize-y focus:outline-none focus:border-[#3B82F6]/50"
            />
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            onClick={executeQuery}
            disabled={queryLoading}
            className="h-8 px-4 text-xs bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white"
          >
            <Play className="h-3 w-3 mr-1.5" />
            {queryLoading ? "Running..." : "Run Query"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setShowSaveForm(true)}
            className="h-8 px-3 text-xs text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
          >
            <Save className="h-3 w-3 mr-1.5" />
            Save as Template
          </Button>
        </div>

        {/* Save template form */}
        {showSaveForm && (
          <div className="flex items-end gap-2 p-3 rounded bg-[#0F1D32] border border-white/10">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-[#9CA3AF] uppercase tracking-wider">Name</label>
              <Input
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                className="h-7 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-[#9CA3AF] uppercase tracking-wider">
                Description
              </label>
              <Input
                value={saveTemplateDesc}
                onChange={(e) => setSaveTemplateDesc(e.target.value)}
                className="h-7 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
              />
            </div>
            <Button
              onClick={saveTemplate}
              className="h-7 px-3 text-xs bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white"
            >
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowSaveForm(false)}
              className="h-7 px-2 text-xs text-[#9CA3AF] hover:text-[#F9FAFB]"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Results Area */}
      <div className="space-y-2">
        {/* Result stats */}
        {queryDurationMs !== null && (
          <div className="flex items-center gap-3 text-xs text-[#9CA3AF]">
            <span>{results.length} result{results.length !== 1 ? "s" : ""}</span>
            <span>{queryDurationMs}ms</span>
          </div>
        )}

        {/* Loading skeleton */}
        {queryLoading && (
          <div className="space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full bg-white/5 rounded-lg" />
            ))}
          </div>
        )}

        {/* Results list */}
        {!queryLoading && results.length > 0 && (
          <div className="space-y-1">
            {results.map((event, i) => {
              const { level, ts, message, stage, action } = extractEventFields(event);
              const isExpanded = expandedRow === i;
              return (
                <div key={i}>
                  <button
                    onClick={() => setExpandedRow(isExpanded ? null : i)}
                    className="w-full text-left bg-[#1A2942] border border-white/5 rounded-lg p-2.5 hover:border-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[#9CA3AF] w-40 shrink-0 truncate">
                        {ts ? new Date(ts).toLocaleString() : "—"}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                          LEVEL_COLORS[level] || LEVEL_COLORS.debug
                        }`}
                      >
                        {level}
                      </span>
                      {stage && (
                        <span className="px-1.5 py-0.5 rounded bg-[#3B82F6]/10 text-[#3B82F6] text-[10px] shrink-0">
                          {stage}
                        </span>
                      )}
                      {action && (
                        <span className="text-[10px] text-[#9CA3AF] shrink-0">{action}</span>
                      )}
                      <span className="text-xs text-[#F9FAFB] truncate">{message}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <pre className="mt-0.5 p-3 rounded-lg bg-[#0F1D32] border border-white/5 text-[10px] font-mono text-[#9CA3AF] overflow-auto max-h-80">
                      {JSON.stringify(event, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!queryLoading && queryDurationMs !== null && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
            <Terminal className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-sm">No log events found</span>
          </div>
        )}
      </div>
    </div>
  );
}
