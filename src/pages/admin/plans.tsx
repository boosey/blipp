import { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Infinity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAdminFetch } from "@/lib/admin-api";
import type { AdminPlan, PaginatedResponse } from "@/types/admin";

// ── Helpers ──

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function limitsText(plan: AdminPlan): string {
  const parts: string[] = [];
  if (plan.briefingsPerWeek != null) {
    parts.push(`${plan.briefingsPerWeek}/wk`);
  } else {
    parts.push("Unlim/wk");
  }
  parts.push(`${plan.maxDurationMinutes}m max`);
  if (plan.maxPodcastSubscriptions != null) {
    parts.push(`${plan.maxPodcastSubscriptions} pods`);
  } else {
    parts.push("Unlim pods");
  }
  return parts.join(" · ");
}

// ── Empty form state ──

interface PlanFormData {
  name: string;
  slug: string;
  description: string;
  briefingsPerWeek: string;
  maxDurationMinutes: string;
  maxPodcastSubscriptions: string;
  adFree: boolean;
  priorityProcessing: boolean;
  earlyAccess: boolean;
  researchMode: boolean;
  crossPodcastSynthesis: boolean;
  priceCentsMonthly: string;
  priceCentsAnnual: string;
  trialDays: string;
  features: string;
  highlighted: boolean;
  sortOrder: string;
  isDefault: boolean;
}

function emptyForm(): PlanFormData {
  return {
    name: "",
    slug: "",
    description: "",
    briefingsPerWeek: "",
    maxDurationMinutes: "5",
    maxPodcastSubscriptions: "",
    adFree: false,
    priorityProcessing: false,
    earlyAccess: false,
    researchMode: false,
    crossPodcastSynthesis: false,
    priceCentsMonthly: "0",
    priceCentsAnnual: "",
    trialDays: "0",
    features: "",
    highlighted: false,
    sortOrder: "0",
    isDefault: false,
  };
}

function planToForm(plan: AdminPlan): PlanFormData {
  return {
    name: plan.name,
    slug: plan.slug,
    description: plan.description ?? "",
    briefingsPerWeek: plan.briefingsPerWeek != null ? String(plan.briefingsPerWeek) : "",
    maxDurationMinutes: String(plan.maxDurationMinutes),
    maxPodcastSubscriptions: plan.maxPodcastSubscriptions != null ? String(plan.maxPodcastSubscriptions) : "",
    adFree: plan.adFree,
    priorityProcessing: plan.priorityProcessing,
    earlyAccess: plan.earlyAccess,
    researchMode: plan.researchMode,
    crossPodcastSynthesis: plan.crossPodcastSynthesis,
    priceCentsMonthly: String(plan.priceCentsMonthly),
    priceCentsAnnual: plan.priceCentsAnnual != null ? String(plan.priceCentsAnnual) : "",
    trialDays: String(plan.trialDays),
    features: plan.features.join(", "),
    highlighted: plan.highlighted,
    sortOrder: String(plan.sortOrder),
    isDefault: plan.isDefault,
  };
}

function formToPayload(form: PlanFormData) {
  return {
    name: form.name,
    slug: form.slug,
    description: form.description || undefined,
    briefingsPerWeek: form.briefingsPerWeek ? Number(form.briefingsPerWeek) : null,
    maxDurationMinutes: Number(form.maxDurationMinutes),
    maxPodcastSubscriptions: form.maxPodcastSubscriptions ? Number(form.maxPodcastSubscriptions) : null,
    adFree: form.adFree,
    priorityProcessing: form.priorityProcessing,
    earlyAccess: form.earlyAccess,
    researchMode: form.researchMode,
    crossPodcastSynthesis: form.crossPodcastSynthesis,
    priceCentsMonthly: Number(form.priceCentsMonthly),
    priceCentsAnnual: form.priceCentsAnnual ? Number(form.priceCentsAnnual) : null,
    trialDays: Number(form.trialDays),
    features: form.features
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    highlighted: form.highlighted,
    sortOrder: Number(form.sortOrder),
    isDefault: form.isDefault,
  };
}

// ── Plan Form Dialog ──

function PlanFormDialog({
  open,
  onOpenChange,
  title,
  form,
  setForm,
  onSubmit,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  form: PlanFormData;
  setForm: (f: PlanFormData) => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  const update = (patch: Partial<PlanFormData>) => setForm({ ...form, ...patch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB] max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 pb-4">
            {/* Identity */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Identity</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#F9FAFB]">Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="Pro"
                    className="h-8 text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#F9FAFB]">Slug</Label>
                  <Input
                    value={form.slug}
                    onChange={(e) => update({ slug: e.target.value })}
                    placeholder="pro"
                    className="h-8 text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB]"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#F9FAFB]">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Plan description..."
                  rows={2}
                  className="text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB] resize-none"
                />
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Limits */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Limits</span>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#F9FAFB]">Briefings/week</Label>
                  <Input
                    type="number"
                    value={form.briefingsPerWeek}
                    onChange={(e) => update({ briefingsPerWeek: e.target.value })}
                    placeholder="Unlimited"
                    className="h-8 text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                  <span className="text-[10px] text-[#9CA3AF]">Empty = unlimited</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#F9FAFB]">Max duration (min)</Label>
                  <Input
                    type="number"
                    value={form.maxDurationMinutes}
                    onChange={(e) => update({ maxDurationMinutes: e.target.value })}
                    className="h-8 text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#F9FAFB]">Max podcasts</Label>
                  <Input
                    type="number"
                    value={form.maxPodcastSubscriptions}
                    onChange={(e) => update({ maxPodcastSubscriptions: e.target.value })}
                    placeholder="Unlimited"
                    className="h-8 text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                  <span className="text-[10px] text-[#9CA3AF]">Empty = unlimited</span>
                </div>
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Features */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Feature Flags</span>
              <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                {([
                  ["adFree", "Ad-Free"],
                  ["priorityProcessing", "Priority Processing"],
                  ["earlyAccess", "Early Access"],
                  ["researchMode", "Research Mode"],
                  ["crossPodcastSynthesis", "Cross-Podcast Synthesis"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs text-[#F9FAFB]">{label}</Label>
                    <Switch
                      checked={form[key]}
                      onCheckedChange={(v) => update({ [key]: v })}
                      className="data-[state=checked]:bg-[#10B981]"
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Billing */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Billing</span>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#F9FAFB]">Monthly price (cents)</Label>
                  <Input
                    type="number"
                    value={form.priceCentsMonthly}
                    onChange={(e) => update({ priceCentsMonthly: e.target.value })}
                    className="h-8 text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#F9FAFB]">Annual price (cents)</Label>
                  <Input
                    type="number"
                    value={form.priceCentsAnnual}
                    onChange={(e) => update({ priceCentsAnnual: e.target.value })}
                    placeholder="Optional"
                    className="h-8 text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#F9FAFB]">Trial days</Label>
                  <Input
                    type="number"
                    value={form.trialDays}
                    onChange={(e) => update({ trialDays: e.target.value })}
                    className="h-8 text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                </div>
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Display */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Display</span>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#F9FAFB]">Features (comma-separated)</Label>
                <Input
                  value={form.features}
                  onChange={(e) => update({ features: e.target.value })}
                  placeholder="e.g. 10 briefings/week, Ad-free listening, Priority processing"
                  className="h-8 text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB]"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#F9FAFB]">Sort order</Label>
                  <Input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => update({ sortOrder: e.target.value })}
                    className="h-8 text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                </div>
                <div className="flex items-center justify-between pt-5">
                  <Label className="text-xs text-[#F9FAFB]">Highlighted</Label>
                  <Switch
                    checked={form.highlighted}
                    onCheckedChange={(v) => update({ highlighted: v })}
                    className="data-[state=checked]:bg-[#F59E0B]"
                  />
                </div>
                <div className="flex items-center justify-between pt-5">
                  <Label className="text-xs text-[#F9FAFB]">Default plan</Label>
                  <Switch
                    checked={form.isDefault}
                    onCheckedChange={(v) => update({ isDefault: v })}
                    className="data-[state=checked]:bg-[#3B82F6]"
                  />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-3 border-t border-white/5">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[#9CA3AF]"
          >
            Cancel
          </Button>
          <Button
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white"
            disabled={saving || !form.name || !form.slug}
            onClick={onSubmit}
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirmation Dialog ──

function DeleteDialog({
  open,
  onOpenChange,
  plan,
  onConfirm,
  deleting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: AdminPlan | null;
  onConfirm: () => void;
  deleting: boolean;
}) {
  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Delete Plan</DialogTitle>
          <DialogDescription className="text-xs text-[#9CA3AF]">
            This will soft-delete the plan "{plan.name}".
          </DialogDescription>
        </DialogHeader>

        {plan.userCount > 0 && (
          <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#EF4444] shrink-0" />
            <span className="text-xs text-[#EF4444]">
              This plan has {plan.userCount} active user{plan.userCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[#9CA3AF]"
          >
            Cancel
          </Button>
          <Button
            className="bg-[#EF4444] hover:bg-[#EF4444]/80 text-white"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Loading Skeleton ──

function PlansSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48 bg-white/5 rounded-lg" />
        <Skeleton className="h-8 w-28 bg-white/5 rounded-lg" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}

// ── Main ──

export default function PlansPage() {
  const apiFetch = useAdminFetch();

  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<AdminPlan | null>(null);
  const [deletePlan, setDeletePlan] = useState<AdminPlan | null>(null);
  const [form, setForm] = useState<PlanFormData>(emptyForm());

  // Toggle saving state per plan id
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadPlans = useCallback(() => {
    setLoading(true);
    apiFetch<PaginatedResponse<AdminPlan>>("/plans?pageSize=50&sort=sortOrder&direction=asc")
      .then((r) => setPlans(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // Create
  const handleCreate = useCallback(() => {
    setForm(emptyForm());
    setCreateOpen(true);
  }, []);

  const submitCreate = useCallback(() => {
    setSaving(true);
    apiFetch("/plans", {
      method: "POST",
      body: JSON.stringify(formToPayload(form)),
    })
      .then(() => {
        setCreateOpen(false);
        loadPlans();
      })
      .catch(console.error)
      .finally(() => setSaving(false));
  }, [apiFetch, form, loadPlans]);

  // Edit
  const handleEdit = useCallback((plan: AdminPlan) => {
    setForm(planToForm(plan));
    setEditPlan(plan);
  }, []);

  const submitEdit = useCallback(() => {
    if (!editPlan) return;
    setSaving(true);
    apiFetch(`/plans/${editPlan.id}`, {
      method: "PATCH",
      body: JSON.stringify(formToPayload(form)),
    })
      .then(() => {
        setEditPlan(null);
        loadPlans();
      })
      .catch(console.error)
      .finally(() => setSaving(false));
  }, [apiFetch, editPlan, form, loadPlans]);

  // Delete
  const submitDelete = useCallback(() => {
    if (!deletePlan) return;
    setDeleting(true);
    apiFetch(`/plans/${deletePlan.id}`, { method: "DELETE" })
      .then(() => {
        setDeletePlan(null);
        loadPlans();
      })
      .catch(console.error)
      .finally(() => setDeleting(false));
  }, [apiFetch, deletePlan, loadPlans]);

  // Inline toggle active
  const handleToggleActive = useCallback(
    (plan: AdminPlan, active: boolean) => {
      setTogglingId(plan.id);
      apiFetch(`/plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      })
        .then(() => loadPlans())
        .catch(console.error)
        .finally(() => setTogglingId(null));
    },
    [apiFetch, loadPlans]
  );

  if (loading && plans.length === 0) return <PlansSkeleton />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#F9FAFB]">Subscription Plans</h2>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">
            {plans.length} plan{plans.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleCreate}
          className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
        >
          <Plus className="h-3 w-3" />
          Add Plan
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg bg-[#0F1D32] border border-white/5 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-3 py-2.5 text-[10px] uppercase text-[#9CA3AF] font-medium">Name</th>
              <th className="text-left px-3 py-2.5 text-[10px] uppercase text-[#9CA3AF] font-medium">Slug</th>
              <th className="text-right px-3 py-2.5 text-[10px] uppercase text-[#9CA3AF] font-medium">Monthly</th>
              <th className="text-right px-3 py-2.5 text-[10px] uppercase text-[#9CA3AF] font-medium">Annual</th>
              <th className="text-center px-3 py-2.5 text-[10px] uppercase text-[#9CA3AF] font-medium">Users</th>
              <th className="text-left px-3 py-2.5 text-[10px] uppercase text-[#9CA3AF] font-medium">Limits</th>
              <th className="text-center px-3 py-2.5 text-[10px] uppercase text-[#9CA3AF] font-medium">Active</th>
              <th className="text-center px-3 py-2.5 text-[10px] uppercase text-[#9CA3AF] font-medium">Order</th>
              <th className="text-right px-3 py-2.5 text-[10px] uppercase text-[#9CA3AF] font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr
                key={plan.id}
                className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors"
              >
                {/* Name */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[#F9FAFB] font-medium">{plan.name}</span>
                    {plan.isDefault && (
                      <Badge className="bg-[#3B82F6]/15 text-[#3B82F6] border-[#3B82F6]/30 text-[9px]">
                        DEFAULT
                      </Badge>
                    )}
                    {plan.highlighted && (
                      <Badge className="bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30 text-[9px]">
                        FEATURED
                      </Badge>
                    )}
                  </div>
                </td>

                {/* Slug */}
                <td className="px-3 py-2.5">
                  <span className="font-mono text-[#9CA3AF]">{plan.slug}</span>
                </td>

                {/* Monthly Price */}
                <td className="px-3 py-2.5 text-right">
                  <span className="font-mono tabular-nums text-[#F9FAFB]">
                    {formatDollars(plan.priceCentsMonthly)}
                  </span>
                </td>

                {/* Annual Price */}
                <td className="px-3 py-2.5 text-right">
                  <span className="font-mono tabular-nums text-[#9CA3AF]">
                    {plan.priceCentsAnnual != null ? formatDollars(plan.priceCentsAnnual) : "-"}
                  </span>
                </td>

                {/* User Count */}
                <td className="px-3 py-2.5 text-center">
                  <Badge className="bg-white/5 text-[#9CA3AF] border-white/10 text-[10px]">
                    {plan.userCount}
                  </Badge>
                </td>

                {/* Limits */}
                <td className="px-3 py-2.5">
                  <span className="text-[#9CA3AF] text-[10px]">{limitsText(plan)}</span>
                </td>

                {/* Active Toggle */}
                <td className="px-3 py-2.5 text-center">
                  <Switch
                    checked={plan.active}
                    onCheckedChange={(v) => handleToggleActive(plan, v)}
                    disabled={togglingId === plan.id}
                    className="data-[state=checked]:bg-[#10B981]"
                  />
                </td>

                {/* Sort Order */}
                <td className="px-3 py-2.5 text-center">
                  <span className="font-mono tabular-nums text-[#9CA3AF]">{plan.sortOrder}</span>
                </td>

                {/* Actions */}
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleEdit(plan)}
                      className="text-[#9CA3AF] hover:text-[#3B82F6]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setDeletePlan(plan)}
                      className="text-[#9CA3AF] hover:text-[#EF4444]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {plans.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
            <CreditCard className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-xs">No plans configured</span>
            <Button
              size="sm"
              onClick={handleCreate}
              className="mt-3 bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
            >
              <Plus className="h-3 w-3" />
              Create First Plan
            </Button>
          </div>
        )}
      </div>

      {/* Feature summary cards */}
      {plans.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {plans
            .filter((p) => p.active)
            .slice(0, 3)
            .map((plan) => {
              const featureFlags = [
                plan.adFree && "Ad-Free",
                plan.priorityProcessing && "Priority",
                plan.earlyAccess && "Early Access",
                plan.researchMode && "Research",
                plan.crossPodcastSynthesis && "Synthesis",
              ].filter((f): f is string => Boolean(f));

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "bg-[#0F1D32] border rounded-lg p-4 hover:border-white/10 transition-colors",
                    plan.highlighted ? "border-[#F59E0B]/30" : "border-white/5"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="h-4 w-4 text-[#3B82F6]" />
                    <span className="text-xs font-semibold text-[#F9FAFB]">{plan.name}</span>
                    <span className="ml-auto text-sm font-mono tabular-nums text-[#F9FAFB]">
                      {formatDollars(plan.priceCentsMonthly)}
                      <span className="text-[10px] text-[#9CA3AF]">/mo</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] mb-2">
                    <div>
                      <span className="text-[#9CA3AF]">Briefings/wk</span>
                      <div className="text-xs text-[#F9FAFB] font-mono">
                        {plan.briefingsPerWeek != null ? plan.briefingsPerWeek : (
                          <Infinity className="h-3 w-3 inline" />
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-[#9CA3AF]">Max duration</span>
                      <div className="text-xs text-[#F9FAFB] font-mono">{plan.maxDurationMinutes}m</div>
                    </div>
                  </div>

                  {featureFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {featureFlags.map((f) => (
                        <Badge
                          key={f}
                          className="bg-white/5 text-[#F9FAFB]/80 text-[9px] font-normal"
                        >
                          <Check className="h-2.5 w-2.5 text-[#10B981] mr-0.5" />
                          {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Create Dialog */}
      <PlanFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create Plan"
        form={form}
        setForm={setForm}
        onSubmit={submitCreate}
        saving={saving}
      />

      {/* Edit Dialog */}
      <PlanFormDialog
        open={!!editPlan}
        onOpenChange={(v) => { if (!v) setEditPlan(null); }}
        title={`Edit Plan: ${editPlan?.name ?? ""}`}
        form={form}
        setForm={setForm}
        onSubmit={submitEdit}
        saving={saving}
      />

      {/* Delete Dialog */}
      <DeleteDialog
        open={!!deletePlan}
        onOpenChange={(v) => { if (!v) setDeletePlan(null); }}
        plan={deletePlan}
        onConfirm={submitDelete}
        deleting={deleting}
      />
    </div>
  );
}
