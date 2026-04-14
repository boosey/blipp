import { useState, useEffect, useCallback } from "react";
import { useAdminFetch } from "@/lib/admin-api";
import { toast } from "sonner";
import {
  Shield,
  Plus,
  Check,
  X,
  RefreshCw,
  Trash2,
  BarChart3,
  Settings2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

// ── Types ──

interface ServiceKeyEntry {
  id: string;
  name: string;
  provider: string;
  envKey: string;
  maskedPreview: string;
  isPrimary: boolean;
  lastValidated: string | null;
  lastValidatedOk: boolean | null;
  lastRotated: string | null;
  rotateAfterDays: number | null;
  notes: string | null;
  rotationOverdue: boolean;
  createdAt: string;
}

interface ContextDef {
  context: string;
  label: string;
  provider: string;
  envKey: string;
  group: string;
  description: string;
  healthCheckable: boolean;
  usageTrackable: boolean;
}

interface UsageData {
  totalCost: number;
  totalRequests: number;
  dailyBreakdown: Array<{
    date: string;
    cost: number;
    requests: number;
    inputTokens: number;
    outputTokens: number;
  }>;
}

// ── Providers for create form ──

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic", envKeys: ["ANTHROPIC_API_KEY"] },
  { value: "openai", label: "OpenAI", envKeys: ["OPENAI_API_KEY"] },
  { value: "groq", label: "Groq", envKeys: ["GROQ_API_KEY"] },
  { value: "deepgram", label: "Deepgram", envKeys: ["DEEPGRAM_API_KEY"] },
  { value: "clerk", label: "Clerk", envKeys: ["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "CLERK_WEBHOOK_SECRET"] },
  { value: "stripe", label: "Stripe", envKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
  { value: "podcast-index", label: "Podcast Index", envKeys: ["PODCAST_INDEX_KEY", "PODCAST_INDEX_SECRET"] },
  { value: "cloudflare", label: "Cloudflare", envKeys: ["CF_API_TOKEN"] },
  { value: "neon", label: "Neon", envKeys: ["NEON_API_KEY"] },
  { value: "vapid", label: "VAPID", envKeys: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] },
];

export default function ServiceKeys() {
  const adminFetch = useAdminFetch();
  const [keys, setKeys] = useState<ServiceKeyEntry[]>([]);
  const [contexts, setContexts] = useState<Record<string, ContextDef[]>>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [registeredProviders, setRegisteredProviders] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [validatingAll, setValidatingAll] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [usageKeyId, setUsageKeyId] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedContextGroups, setExpandedContextGroups] = useState<Record<string, boolean>>({});

  // ── Create form state ──
  const [newName, setNewName] = useState("");
  const [newProvider, setNewProvider] = useState("");
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newIsPrimary, setNewIsPrimary] = useState(false);
  const [newRotateDays, setNewRotateDays] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [showNewValue, setShowNewValue] = useState(false);
  const [newAssignContexts, setNewAssignContexts] = useState<string[]>([]);

  // ── Edit state ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showEditValue, setShowEditValue] = useState(false);

  const load = useCallback(async () => {
    try {
      const [keysRes, ctxRes, assignRes] = await Promise.all([
        adminFetch<{ data: ServiceKeyEntry[] }>("/service-keys"),
        adminFetch<{ data: Record<string, ContextDef[]>; registeredProviders: Record<string, string[]> }>("/service-keys/contexts"),
        adminFetch<{ data: Record<string, string> }>("/service-keys/assignments"),
      ]);
      setKeys(keysRes.data || []);
      setContexts(ctxRes.data || {});
      setRegisteredProviders(ctxRes.registeredProviders || {});
      setAssignments(assignRes.data || {});
    } catch {
      toast.error("Failed to load service keys");
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Actions ──

  async function createKey() {
    if (!newName || !newProvider || !newEnvKey || !newValue) {
      toast.error("Fill in all required fields");
      return;
    }
    try {
      const res = await adminFetch<{ data: { id: string } }>("/service-keys", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          provider: newProvider,
          envKey: newEnvKey,
          value: newValue,
          isPrimary: newIsPrimary,
          rotateAfterDays: newRotateDays ? parseInt(newRotateDays) : undefined,
          notes: newNotes || undefined,
        }),
      });

      // Assign to selected contexts
      if (newAssignContexts.length > 0 && res.data?.id) {
        await Promise.all(
          newAssignContexts.map((ctx) =>
            adminFetch(`/service-keys/assignments/${ctx}`, {
              method: "PUT",
              body: JSON.stringify({ serviceKeyId: res.data.id }),
            })
          )
        );
      }

      toast.success(
        newAssignContexts.length > 0
          ? `Service key created and assigned to ${newAssignContexts.length} context(s)`
          : "Service key created"
      );
      resetCreateForm();
      load();
    } catch {
      toast.error("Failed to create key");
    }
  }

  function resetCreateForm() {
    setShowCreate(false);
    setNewName("");
    setNewProvider("");
    setNewEnvKey("");
    setNewValue("");
    setNewIsPrimary(false);
    setNewRotateDays("");
    setNewNotes("");
    setShowNewValue(false);
    setNewAssignContexts([]);
  }

  async function validateKey(id: string) {
    setValidatingId(id);
    try {
      const res = await adminFetch<{ data: { valid: boolean; latencyMs: number; error?: string } }>(
        `/service-keys/${id}/validate`,
        { method: "POST" }
      );
      if (res.data.valid) {
        toast.success(`Key valid (${res.data.latencyMs}ms)`);
      } else {
        toast.error(`Key invalid: ${res.data.error || "unknown error"}`);
      }
      load();
    } catch {
      toast.error("Validation failed");
    } finally {
      setValidatingId(null);
    }
  }

  async function validateAll() {
    setValidatingAll(true);
    try {
      const res = await adminFetch<{
        data: Array<{ id: string; name: string; result: { valid: boolean } | null }>;
      }>("/service-keys/validate-all", { method: "POST" });
      const valid = res.data.filter((r) => r.result?.valid).length;
      const failed = res.data.filter((r) => r.result && !r.result.valid).length;
      const skipped = res.data.filter((r) => !r.result).length;
      toast.success(
        `Validation complete: ${valid} valid, ${failed} failed, ${skipped} skipped`
      );
      load();
    } catch {
      toast.error("Batch validation failed");
    } finally {
      setValidatingAll(false);
    }
  }

  async function deleteKey(id: string) {
    try {
      await adminFetch(`/service-keys/${id}`, { method: "DELETE" });
      toast.success("Key deleted");
      load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete key");
    }
  }

  async function updateKeyValue(id: string) {
    if (!editValue) return;
    try {
      await adminFetch(`/service-keys/${id}`, {
        method: "PUT",
        body: JSON.stringify({ value: editValue }),
      });
      toast.success("Key updated. New value takes effect within a few minutes.");
      setEditingId(null);
      setEditValue("");
      load();
    } catch {
      toast.error("Failed to update key");
    }
  }

  async function loadUsage(id: string) {
    if (usageKeyId === id) {
      setUsageKeyId(null);
      return;
    }
    setUsageKeyId(id);
    try {
      const res = await adminFetch<{ data: UsageData }>(`/service-keys/${id}/usage`);
      setUsageData(res.data);
    } catch {
      toast.error("Failed to load usage data");
      setUsageKeyId(null);
    }
  }

  async function setAssignment(context: string, serviceKeyId: string | null) {
    try {
      await adminFetch(`/service-keys/assignments/${context}`, {
        method: "PUT",
        body: JSON.stringify({ serviceKeyId }),
      });
      toast.success(`Assignment updated for ${context}`);
      load();
    } catch {
      toast.error("Failed to update assignment");
    }
  }

  // ── Computed values ──

  const groupedKeys: Record<string, ServiceKeyEntry[]> = {};
  for (const k of keys) {
    const group = k.provider;
    if (!groupedKeys[group]) groupedKeys[group] = [];
    groupedKeys[group].push(k);
  }

  const totalKeys = keys.length;
  const healthyCount = keys.filter((k) => k.lastValidatedOk === true).length;
  const failedCount = keys.filter((k) => k.lastValidatedOk === false).length;
  const overdueCount = keys.filter((k) => k.rotationOverdue).length;

  const availableEnvKeys =
    PROVIDERS.find((p) => p.value === newProvider)?.envKeys ?? [];

  // ── Render ──

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-[#1A2942] rounded w-48 animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-[#1A2942] rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#3B82F6]" />
          <h1 className="text-lg font-semibold">Service Keys</h1>
          <span className="text-xs text-[#9CA3AF]">
            External service credentials
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={validateAll}
            disabled={validatingAll || keys.length === 0}
            className="text-xs gap-1.5 border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${validatingAll ? "animate-spin" : ""}`}
            />
            Validate All
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate(!showCreate)}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Key
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Total Keys" value={totalKeys} />
        <SummaryCard
          label="Healthy"
          value={healthyCount}
          color={healthyCount > 0 ? "green" : undefined}
        />
        <SummaryCard
          label="Failed"
          value={failedCount}
          color={failedCount > 0 ? "red" : undefined}
        />
        <SummaryCard
          label="Rotation Overdue"
          value={overdueCount}
          color={overdueCount > 0 ? "orange" : undefined}
        />
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-[#1A2942] border border-white/5 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-[#F9FAFB]">
            Add Service Key
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (e.g. Anthropic - Production)"
              className="bg-[#0F1D32] border-white/10 text-sm text-[#F9FAFB] placeholder:text-[#9CA3AF]/60"
            />
            <select
              value={newProvider}
              onChange={(e) => {
                setNewProvider(e.target.value);
                setNewEnvKey("");
              }}
              className="bg-[#0F1D32] border border-white/10 rounded-md px-3 text-sm text-[#F9FAFB]"
            >
              <option value="">Select provider...</option>
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={newEnvKey}
              onChange={(e) => setNewEnvKey(e.target.value)}
              disabled={!newProvider}
              className="bg-[#0F1D32] border border-white/10 rounded-md px-3 text-sm text-[#F9FAFB] disabled:opacity-50"
            >
              <option value="">Select env key...</option>
              {availableEnvKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <div className="relative">
              <Input
                type={showNewValue ? "text" : "password"}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="Key value"
                className="bg-[#0F1D32] border-white/10 text-sm text-[#F9FAFB] placeholder:text-[#9CA3AF]/60 pr-10 font-mono"
              />
              <button
                onClick={() => setShowNewValue(!showNewValue)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#F9FAFB]"
              >
                {showNewValue ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-[#9CA3AF]">
              <Switch
                checked={newIsPrimary}
                onCheckedChange={setNewIsPrimary}
              />
              Primary (syncs to CF Workers secret)
            </label>
            <Input
              type="number"
              value={newRotateDays}
              onChange={(e) => setNewRotateDays(e.target.value)}
              placeholder="Rotate after days"
              className="w-40 bg-[#0F1D32] border-white/10 text-sm text-[#F9FAFB] placeholder:text-[#9CA3AF]/60"
            />
          </div>
          <Input
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="bg-[#0F1D32] border-white/10 text-sm text-[#F9FAFB] placeholder:text-[#9CA3AF]/60"
          />

          {/* Context assignment — show relevant contexts for the selected provider */}
          {newProvider && (
            <ContextAssignmentPicker
              provider={newProvider}
              contexts={contexts}
              registeredProviders={registeredProviders}
              selected={newAssignContexts}
              onChange={setNewAssignContexts}
            />
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={createKey}
              disabled={!newName || !newProvider || !newEnvKey || !newValue}
              className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
            >
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={resetCreateForm}
              className="text-xs text-[#9CA3AF]"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Key List (grouped by provider) */}
      {Object.entries(groupedKeys).map(([provider, providerKeys]) => (
        <div
          key={provider}
          className="bg-[#1A2942] border border-white/5 rounded-lg overflow-hidden"
        >
          <button
            onClick={() =>
              setExpandedGroups((prev) => ({
                ...prev,
                [provider]: !prev[provider],
              }))
            }
            className="w-full flex items-center justify-between p-3 hover:bg-white/5"
          >
            <div className="flex items-center gap-2">
              {expandedGroups[provider] !== false ? (
                <ChevronDown className="h-4 w-4 text-[#9CA3AF]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#9CA3AF]" />
              )}
              <span className="text-sm font-medium text-[#F9FAFB] capitalize">
                {provider.replace("-", " ")}
              </span>
              <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
                {providerKeys.length}
              </Badge>
            </div>
          </button>

          {expandedGroups[provider] !== false && (
            <div className="border-t border-white/5 divide-y divide-white/5">
              {providerKeys.map((k) => (
                <div key={k.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-[#F9FAFB]">
                        {k.name}
                      </span>
                      {k.isPrimary && (
                        <Badge className="bg-[#3B82F6]/10 text-[#3B82F6] text-[10px]">
                          Primary
                        </Badge>
                      )}
                      <HealthBadge
                        validated={k.lastValidated}
                        ok={k.lastValidatedOk}
                      />
                      {k.rotationOverdue && (
                        <Badge className="bg-[#F59E0B]/10 text-[#F59E0B] text-[10px] gap-1">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Overdue
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => validateKey(k.id)}
                        disabled={validatingId === k.id}
                        className="h-7 w-7 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
                        title="Validate"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${validatingId === k.id ? "animate-spin" : ""}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setEditingId(editingId === k.id ? null : k.id)
                        }
                        className="h-7 w-7 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
                        title="Edit"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => loadUsage(k.id)}
                        className="h-7 w-7 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
                        title="Usage"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteKey(k.id)}
                        className="h-7 w-7 text-[#EF4444] hover:bg-[#EF4444]/10"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[#9CA3AF]">
                    <code className="font-mono text-[#9CA3AF]/80">
                      {k.envKey}
                    </code>
                    <span className="font-mono">{k.maskedPreview}</span>
                    {k.lastValidated && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Checked{" "}
                        {new Date(k.lastValidated).toLocaleDateString()}
                      </span>
                    )}
                    {k.rotateAfterDays && (
                      <span>
                        Rotate every {k.rotateAfterDays}d
                      </span>
                    )}
                  </div>

                  {/* Edit inline */}
                  {editingId === k.id && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="relative flex-1">
                        <Input
                          type={showEditValue ? "text" : "password"}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder="New key value"
                          className="bg-[#0F1D32] border-white/10 text-sm text-[#F9FAFB] font-mono pr-10"
                        />
                        <button
                          onClick={() => setShowEditValue(!showEditValue)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#F9FAFB]"
                        >
                          {showEditValue ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => updateKeyValue(k.id)}
                        disabled={!editValue}
                        className="bg-[#3B82F6] text-white text-xs"
                      >
                        Update
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setEditValue("");
                        }}
                        className="text-xs text-[#9CA3AF]"
                      >
                        Cancel
                      </Button>
                    </div>
                  )}

                  {/* Usage drawer */}
                  {usageKeyId === k.id && usageData && (
                    <UsagePanel data={usageData} />
                  )}

                  {k.notes && (
                    <p className="text-[10px] text-[#9CA3AF]/60 italic">
                      {k.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {keys.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
          <Shield className="h-8 w-8 mb-2 opacity-40" />
          <span className="text-sm">No service keys configured</span>
          <p className="text-xs text-[#9CA3AF]/60 mt-1">
            Keys will fall back to Cloudflare Worker environment variables
          </p>
        </div>
      )}

      {/* Context Assignments */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[#F9FAFB] flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-[#3B82F6]" />
          Context Assignments
        </h2>
        <p className="text-xs text-[#9CA3AF]">
          Assign specific keys to each usage context. Unassigned contexts use
          the primary key or environment variable.
        </p>

        {Object.entries(contexts).map(([group, ctxList]) => (
          <div
            key={group}
            className="bg-[#1A2942] border border-white/5 rounded-lg overflow-hidden"
          >
            <button
              onClick={() =>
                setExpandedContextGroups((prev) => ({
                  ...prev,
                  [group]: !prev[group],
                }))
              }
              className="w-full flex items-center gap-2 p-3 hover:bg-white/5"
            >
              {expandedContextGroups[group] !== false ? (
                <ChevronDown className="h-4 w-4 text-[#9CA3AF]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#9CA3AF]" />
              )}
              <span className="text-sm font-medium text-[#F9FAFB]">
                {group}
              </span>
              <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
                {ctxList.length}
              </Badge>
            </button>

            {expandedContextGroups[group] !== false && (
              <div className="border-t border-white/5 divide-y divide-white/5">
                {ctxList.map((ctx) => {
                  const providers = registeredProviders[ctx.context];
                  const hasProviderSlots = providers && providers.length > 0;

                  return (
                    <div key={ctx.context} className="p-3 space-y-2">
                      <div className="min-w-0">
                        <p className="text-sm text-[#F9FAFB]">{ctx.label}</p>
                        <p className="text-[10px] text-[#9CA3AF]/60">
                          {ctx.description}
                        </p>
                      </div>

                      {hasProviderSlots ? (
                        <div className="space-y-1.5 pl-3 border-l border-white/5">
                          {providers.map((provider) => {
                            const assignmentKey = `${ctx.context}.${provider}`;
                            const assignedKeyId = assignments[assignmentKey];
                            const assignedKey = assignedKeyId
                              ? keys.find((k) => k.id === assignedKeyId)
                              : undefined;

                            return (
                              <KeySlot
                                key={provider}
                                label={provider}
                                provider={provider}
                                envKey={ctx.envKey}
                                contextKey={assignmentKey}
                                assignedKey={assignedKey}
                                adminFetch={adminFetch}
                                onChanged={load}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <KeySlot
                          label={ctx.label}
                          provider={ctx.provider}
                          envKey={ctx.envKey}
                          contextKey={ctx.context}
                          assignedKey={
                            assignments[ctx.context]
                              ? keys.find((k) => k.id === assignments[ctx.context])
                              : undefined
                          }
                          adminFetch={adminFetch}
                          onChanged={load}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ──

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "green" | "red" | "orange";
}) {
  const colorClass =
    color === "green"
      ? "text-[#10B981]"
      : color === "red"
        ? "text-[#EF4444]"
        : color === "orange"
          ? "text-[#F59E0B]"
          : "text-[#F9FAFB]";

  return (
    <div className="bg-[#1A2942] border border-white/5 rounded-lg p-3">
      <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-xl font-semibold ${colorClass}`}>{value}</p>
    </div>
  );
}

function HealthBadge({
  validated,
  ok,
}: {
  validated: string | null;
  ok: boolean | null;
}) {
  if (!validated) {
    return (
      <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
        Unchecked
      </Badge>
    );
  }
  return ok ? (
    <Badge className="bg-[#10B981]/10 text-[#10B981] text-[10px] gap-1">
      <Check className="h-2.5 w-2.5" />
      Healthy
    </Badge>
  ) : (
    <Badge className="bg-[#EF4444]/10 text-[#EF4444] text-[10px] gap-1">
      <X className="h-2.5 w-2.5" />
      Failed
    </Badge>
  );
}

/**
 * Inline key slot — paste a key directly into a context assignment.
 * Creates the ServiceKey and assigns it in one step.
 */
function KeySlot({
  label,
  provider,
  envKey,
  contextKey,
  assignedKey,
  adminFetch,
  onChanged,
}: {
  label: string;
  provider: string;
  envKey: string;
  contextKey: string;
  assignedKey?: ServiceKeyEntry;
  adminFetch: ReturnType<typeof useAdminFetch>;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveKey() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      // Create the key and assign it in one flow
      const res = await adminFetch<{ data: { id: string } }>("/service-keys", {
        method: "POST",
        body: JSON.stringify({
          name: `${label} — ${contextKey}`,
          provider,
          envKey,
          value: value.trim(),
          isPrimary: false,
        }),
      });
      // Assign to this context
      await adminFetch(`/service-keys/assignments/${contextKey}`, {
        method: "PUT",
        body: JSON.stringify({ serviceKeyId: res.data.id }),
      });
      toast.success("Key saved");
      setEditing(false);
      setValue("");
      onChanged();
    } catch {
      toast.error("Failed to save key");
    } finally {
      setSaving(false);
    }
  }

  async function replaceKey() {
    if (!value.trim() || !assignedKey) return;
    setSaving(true);
    try {
      // Update the existing key's value
      await adminFetch(`/service-keys/${assignedKey.id}`, {
        method: "PUT",
        body: JSON.stringify({ value: value.trim() }),
      });
      toast.success("Key updated");
      setEditing(false);
      setValue("");
      onChanged();
    } catch {
      toast.error("Failed to update key");
    } finally {
      setSaving(false);
    }
  }

  async function clearKey() {
    try {
      await adminFetch(`/service-keys/assignments/${contextKey}`, {
        method: "PUT",
        body: JSON.stringify({ serviceKeyId: null }),
      });
      toast.success("Reverted to default (env)");
      onChanged();
    } catch {
      toast.error("Failed to clear assignment");
    }
  }

  return (
    <div className="flex items-center gap-2 min-h-[32px]">
      <span className="text-xs text-[#9CA3AF] capitalize min-w-[100px] shrink-0">
        {label}
      </span>

      {editing ? (
        <div className="flex items-center gap-1.5 flex-1">
          <div className="relative flex-1">
            <Input
              type={showValue ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste key value"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") assignedKey ? replaceKey() : saveKey();
                if (e.key === "Escape") { setEditing(false); setValue(""); }
              }}
              className="h-7 bg-[#0F1D32] border-white/10 text-xs text-[#F9FAFB] font-mono pr-8"
            />
            <button
              onClick={() => setShowValue(!showValue)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#F9FAFB]"
            >
              {showValue ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          </div>
          <Button
            size="sm"
            onClick={assignedKey ? replaceKey : saveKey}
            disabled={!value.trim() || saving}
            className="h-7 bg-[#3B82F6] text-white text-[10px] px-2"
          >
            {saving ? "..." : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setEditing(false); setValue(""); }}
            className="h-7 text-[10px] text-[#9CA3AF] px-1.5"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : assignedKey ? (
        <div className="flex items-center gap-2 flex-1">
          <code className="text-xs font-mono text-[#9CA3AF]">
            {assignedKey.maskedPreview}
          </code>
          <HealthBadge validated={assignedKey.lastValidated} ok={assignedKey.lastValidatedOk} />
          <div className="flex items-center gap-0.5 ml-auto">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              className="h-6 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] px-1.5"
            >
              Change
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearKey}
              className="h-6 text-[10px] text-[#9CA3AF] hover:text-[#EF4444] px-1.5"
            >
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 text-xs text-[#9CA3AF]/60 hover:text-[#3B82F6] transition-colors"
        >
          <Plus className="h-3 w-3" />
          Set key
        </button>
      )}
    </div>
  );
}

/**
 * Shows checkboxes for assigning a new key to contexts during creation.
 * Includes both provider-scoped pipeline contexts and general contexts
 * that match the selected provider.
 */
function ContextAssignmentPicker({
  provider,
  contexts,
  registeredProviders,
  selected,
  onChange,
}: {
  provider: string;
  contexts: Record<string, ContextDef[]>;
  registeredProviders: Record<string, string[]>;
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  // Build list of assignable context keys for this provider
  const assignable: Array<{ key: string; label: string; group: string }> = [];

  for (const [group, ctxList] of Object.entries(contexts)) {
    for (const ctx of ctxList) {
      // Check if this context has provider-scoped slots
      const providers = registeredProviders[ctx.context];
      if (providers?.includes(provider)) {
        // Provider-scoped pipeline slot
        assignable.push({
          key: `${ctx.context}.${provider}`,
          label: `${ctx.label} (${provider})`,
          group,
        });
      } else if (ctx.provider === provider) {
        // General context that matches this provider directly
        assignable.push({
          key: ctx.context,
          label: ctx.label,
          group,
        });
      }
    }
  }

  if (assignable.length === 0) return null;

  function toggle(key: string) {
    onChange(
      selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key]
    );
  }

  // Group the assignable items
  const grouped: Record<string, typeof assignable> = {};
  for (const item of assignable) {
    if (!grouped[item.group]) grouped[item.group] = [];
    grouped[item.group].push(item);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[#9CA3AF] font-medium">
        Assign to contexts
      </p>
      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} className="space-y-0.5">
          <p className="text-[10px] text-[#9CA3AF]/60 uppercase tracking-wider">
            {group}
          </p>
          {items.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(item.key)}
                onChange={() => toggle(item.key)}
                className="accent-[#3B82F6]"
              />
              <span className="text-sm text-[#F9FAFB]">{item.label}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

function UsagePanel({ data }: { data: UsageData }) {
  if (data.totalRequests === 0) {
    return (
      <div className="bg-[#0F1D32] rounded p-3 text-xs text-[#9CA3AF]">
        No usage data in the last 30 days
      </div>
    );
  }

  const maxCost = Math.max(...data.dailyBreakdown.map((d) => d.cost), 0.001);

  return (
    <div className="bg-[#0F1D32] rounded p-3 space-y-2">
      <div className="flex items-center gap-4 text-xs">
        <span className="text-[#9CA3AF]">
          30d Cost:{" "}
          <span className="text-[#F9FAFB] font-medium">
            ${data.totalCost.toFixed(4)}
          </span>
        </span>
        <span className="text-[#9CA3AF]">
          Requests:{" "}
          <span className="text-[#F9FAFB] font-medium">
            {data.totalRequests.toLocaleString()}
          </span>
        </span>
      </div>
      {/* Simple bar chart */}
      <div className="flex items-end gap-px h-16">
        {data.dailyBreakdown
          .slice(0, 30)
          .reverse()
          .map((d, i) => {
            const height = Math.max((d.cost / maxCost) * 100, 2);
            return (
              <div
                key={i}
                className="flex-1 bg-[#3B82F6]/60 hover:bg-[#3B82F6] rounded-t transition-colors"
                style={{ height: `${height}%` }}
                title={`${d.date}: $${d.cost.toFixed(4)} (${d.requests} reqs)`}
              />
            );
          })}
      </div>
    </div>
  );
}
