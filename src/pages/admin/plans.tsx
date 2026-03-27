import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminFetch } from "@/lib/admin-api";
import type { AdminPlan, DurationTier, PaginatedResponse, VoicePresetEntry } from "@/types/admin";
import {
  PlanFormDialog,
  DeleteDialog,
  DeactivateDialog,
  PlanCard,
  DurationTiersPanel,
  PlansSkeleton,
  emptyForm,
  planToForm,
  formToPayload,
} from "@/components/admin/plans";
import type { PlanFormData } from "@/components/admin/plans";

export default function PlansPage() {
  const apiFetch = useAdminFetch();

  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<AdminPlan | null>(null);
  const [deletePlan, setDeletePlan] = useState<AdminPlan | null>(null);
  const [form, setForm] = useState<PlanFormData>(emptyForm());

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deactivatePlan, setDeactivatePlan] = useState<AdminPlan | null>(null);

  const [durationTiers, setDurationTiers] = useState<DurationTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [tiersOpen, setTiersOpen] = useState(false);

  const [voicePresets, setVoicePresets] = useState<VoicePresetEntry[]>([]);

  const loadPlans = useCallback(() => {
    setLoading(true);
    apiFetch<PaginatedResponse<AdminPlan>>("/plans?pageSize=50&sort=sortOrder&direction=asc")
      .then((r) => setPlans(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  useEffect(() => {
    apiFetch<{ data: VoicePresetEntry[] }>("/voice-presets?includeInactive=true")
      .then((r) => setVoicePresets(r.data ?? []))
      .catch(() => {});
  }, [apiFetch]);

  useEffect(() => {
    setTiersLoading(true);
    apiFetch<{ data: DurationTier[] }>("/config/tiers/duration")
      .then((r) => setDurationTiers(r.data))
      .catch(console.error)
      .finally(() => setTiersLoading(false));
  }, [apiFetch]);

  const handleCreate = useCallback(() => { setForm(emptyForm()); setCreateOpen(true); }, []);

  const submitCreate = useCallback(() => {
    setSaving(true);
    apiFetch("/plans", { method: "POST", body: JSON.stringify(formToPayload(form)) })
      .then(() => { setCreateOpen(false); loadPlans(); })
      .catch(console.error)
      .finally(() => setSaving(false));
  }, [apiFetch, form, loadPlans]);

  const handleEdit = useCallback((plan: AdminPlan) => { setForm(planToForm(plan)); setEditPlan(plan); }, []);

  const submitEdit = useCallback(() => {
    if (!editPlan) return;
    setSaving(true);
    apiFetch(`/plans/${editPlan.id}`, { method: "PATCH", body: JSON.stringify(formToPayload(form)) })
      .then(() => { setEditPlan(null); loadPlans(); })
      .catch(console.error)
      .finally(() => setSaving(false));
  }, [apiFetch, editPlan, form, loadPlans]);

  const submitDelete = useCallback(() => {
    if (!deletePlan) return;
    setDeleting(true);
    apiFetch(`/plans/${deletePlan.id}`, { method: "DELETE" })
      .then(() => { toast.success(`Plan "${deletePlan.name}" deactivated`); setDeletePlan(null); loadPlans(); })
      .catch((e) => { toast.error(e instanceof Error ? e.message : "Failed to delete plan"); })
      .finally(() => setDeleting(false));
  }, [apiFetch, deletePlan, loadPlans]);

  const handleToggleActive = useCallback(
    (plan: AdminPlan, active: boolean) => {
      if (!active) { setDeactivatePlan(plan); return; }
      setTogglingId(plan.id);
      apiFetch(`/plans/${plan.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) })
        .then(() => { toast.success(`Plan "${plan.name}" activated`); loadPlans(); })
        .catch((e) => { toast.error(e instanceof Error ? e.message : "Failed to activate plan"); })
        .finally(() => setTogglingId(null));
    },
    [apiFetch, loadPlans]
  );

  const confirmDeactivate = useCallback(() => {
    if (!deactivatePlan) return;
    setTogglingId(deactivatePlan.id);
    apiFetch(`/plans/${deactivatePlan.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) })
      .then(() => { toast.success(`Plan "${deactivatePlan.name}" deactivated`); setDeactivatePlan(null); loadPlans(); })
      .catch((e) => { toast.error(e instanceof Error ? e.message : "Failed to deactivate plan"); })
      .finally(() => setTogglingId(null));
  }, [apiFetch, deactivatePlan, loadPlans]);

  if (loading && plans.length === 0) return <PlansSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#F9FAFB]">Subscription Plans</h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            {plans.length} plan{plans.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <Button size="sm" onClick={handleCreate} className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5">
          <Plus className="h-3 w-3" />
          Add Plan
        </Button>
      </div>

      {plans.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
          <CreditCard className="h-8 w-8 mb-2 opacity-40" />
          <span className="text-xs">No plans configured</span>
          <Button size="sm" onClick={handleCreate} className="mt-3 bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5">
            <Plus className="h-3 w-3" />
            Create First Plan
          </Button>
        </div>
      )}

      {plans.length > 0 && (
        <div className="space-y-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              voicePresets={voicePresets}
              togglingId={togglingId}
              onToggleActive={handleToggleActive}
              onEdit={handleEdit}
              onDelete={setDeletePlan}
            />
          ))}
        </div>
      )}

      <DurationTiersPanel
        tiers={durationTiers}
        loading={tiersLoading}
        open={tiersOpen}
        onToggle={() => setTiersOpen((v) => !v)}
      />

      <PlanFormDialog open={createOpen} onOpenChange={setCreateOpen} title="Create Plan" form={form} setForm={setForm} onSubmit={submitCreate} saving={saving} voicePresets={voicePresets} />
      <PlanFormDialog open={!!editPlan} onOpenChange={(v) => { if (!v) setEditPlan(null); }} title={`Edit Plan: ${editPlan?.name ?? ""}`} form={form} setForm={setForm} onSubmit={submitEdit} saving={saving} voicePresets={voicePresets} />
      <DeleteDialog open={!!deletePlan} onOpenChange={(v) => { if (!v) setDeletePlan(null); }} plan={deletePlan} onConfirm={submitDelete} deleting={deleting} />
      <DeactivateDialog open={!!deactivatePlan} onOpenChange={(v) => { if (!v) setDeactivatePlan(null); }} plan={deactivatePlan} onConfirm={confirmDeactivate} confirming={togglingId === deactivatePlan?.id} />
    </div>
  );
}
