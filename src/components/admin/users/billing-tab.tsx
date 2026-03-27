import { useState, useEffect, useCallback } from "react";
import { CreditCard, Shield, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminFetch } from "@/lib/admin-api";
import type { AdminUserDetail, AdminPlan } from "@/types/admin";
import { formatDate, planBadgeClass } from "./helpers";

export interface BillingTabProps {
  user: AdminUserDetail;
  onUpdate: () => void;
}

export function BillingTab({ user, onUpdate }: BillingTabProps) {
  const apiFetch = useAdminFetch();
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(user.plan.id);
  const [availablePlans, setAvailablePlans] = useState<AdminPlan[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (planModalOpen && availablePlans.length === 0) {
      apiFetch<{ data: AdminPlan[] }>("/plans")
        .then((r) => setAvailablePlans(r.data))
        .catch(console.error);
    }
  }, [planModalOpen, availablePlans.length, apiFetch]);

  const handlePlanSave = useCallback(() => {
    if (selectedPlanId === user.plan.id) return;
    setSaving(true);
    apiFetch(`/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ planId: selectedPlanId }),
    })
      .then(() => {
        setPlanModalOpen(false);
        onUpdate();
      })
      .catch(console.error)
      .finally(() => setSaving(false));
  }, [apiFetch, user.id, user.plan.id, selectedPlanId, onUpdate]);

  const handleAdminToggle = useCallback(
    (isAdmin: boolean) => {
      setSaving(true);
      apiFetch(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isAdmin }),
      })
        .then(() => onUpdate())
        .catch(console.error)
        .finally(() => setSaving(false));
    },
    [apiFetch, user.id, onUpdate]
  );

  return (
    <div className="space-y-4">
      {/* Subscription Card */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-[#F59E0B]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Subscription</span>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Current Plan</span>
            <Badge className={cn("text-[9px] uppercase", planBadgeClass(user.plan.slug))}>
              {user.plan.name}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Signup Date</span>
            <span className="text-[#F9FAFB]">{formatDate(user.createdAt)}</span>
          </div>
          {user.stripeCustomerId && (
            <div className="flex justify-between">
              <span className="text-[#9CA3AF]">Stripe ID</span>
              <span className="text-[#F9FAFB] font-mono text-[10px] truncate ml-4">
                {user.stripeCustomerId}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Admin Actions */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#F97316]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Admin Actions</span>
        </div>

        <Button
          size="sm"
          className="w-full bg-[#3B82F6]/15 text-[#3B82F6] hover:bg-[#3B82F6]/25 border border-[#3B82F6]/20"
          onClick={() => {
            setSelectedPlanId(user.plan.id);
            setPlanModalOpen(true);
          }}
        >
          <CreditCard className="h-3.5 w-3.5" /> Change Plan
        </Button>

        <Separator className="bg-white/5" />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs text-[#F9FAFB]">Admin Access</Label>
            <div className="text-[10px] text-[#9CA3AF]">
              Grant admin privileges to this user
            </div>
          </div>
          <Switch
            checked={user.isAdmin}
            onCheckedChange={handleAdminToggle}
            disabled={saving}
          />
        </div>

        <Separator className="bg-white/5" />

        <Button
          size="sm"
          variant="ghost"
          className="w-full text-[#F59E0B] hover:bg-[#F59E0B]/10 border border-[#F59E0B]/20"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            apiFetch(`/users/${user.id}`, {
              method: "PATCH",
              body: JSON.stringify({ onboardingComplete: false }),
            })
              .then(() => onUpdate())
              .catch(console.error)
              .finally(() => setSaving(false));
          }}
        >
          Reset Onboarding
        </Button>
      </div>

      {/* Change Plan Modal */}
      <Dialog open={planModalOpen} onOpenChange={setPlanModalOpen}>
        <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
          <DialogHeader>
            <DialogTitle className="text-sm">Change Plan for {user.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger className="bg-[#0A1628] border-white/5 text-[#F9FAFB]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1A2942] border-white/10">
                {availablePlans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPlanModalOpen(false)}
              className="text-[#9CA3AF]"
            >
              Cancel
            </Button>
            <Button
              className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white"
              disabled={saving || selectedPlanId === user.plan.id}
              onClick={handlePlanSave}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
