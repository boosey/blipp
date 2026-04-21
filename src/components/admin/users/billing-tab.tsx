import { useState, useEffect, useCallback } from "react";
import { CreditCard, Shield, Crown, X, ChevronDown, ChevronRight, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

interface BillingEvent {
  id: string;
  source: "STRIPE" | "APPLE" | "MANUAL";
  eventType: string;
  environment: string | null;
  externalId: string | null;
  productExternalId: string | null;
  status: "APPLIED" | "SKIPPED" | "FAILED";
  skipReason: string | null;
  rawPayload: unknown;
  createdAt: string;
}

interface BillingEventsResponse {
  data: BillingEvent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BillingTabProps {
  user: AdminUserDetail;
  onUpdate: () => void;
}

function defaultEndsAt(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

export function BillingTab({ user, onUpdate }: BillingTabProps) {
  const apiFetch = useAdminFetch();
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(user.plan.id);
  const [endsAt, setEndsAt] = useState(defaultEndsAt());
  const [reason, setReason] = useState("");
  const [availablePlans, setAvailablePlans] = useState<AdminPlan[]>([]);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsTotalPages, setEventsTotalPages] = useState(1);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const loadEvents = useCallback(
    (page: number) => {
      setEventsLoading(true);
      apiFetch<BillingEventsResponse>(
        `/users/${user.id}/billing-events?page=${page}&pageSize=20`
      )
        .then((r) => {
          setEvents(r.data);
          setEventsPage(r.page);
          setEventsTotalPages(r.totalPages);
        })
        .catch(console.error)
        .finally(() => setEventsLoading(false));
    },
    [apiFetch, user.id]
  );

  useEffect(() => {
    loadEvents(1);
  }, [loadEvents]);

  useEffect(() => {
    if (grantModalOpen && availablePlans.length === 0) {
      apiFetch<{ data: AdminPlan[] }>("/plans")
        .then((r) => setAvailablePlans(r.data))
        .catch(console.error);
    }
  }, [grantModalOpen, availablePlans.length, apiFetch]);

  const handleGrantSave = useCallback(() => {
    if (!selectedPlanId || !endsAt) return;
    setSaving(true);
    apiFetch(`/users/${user.id}/grants`, {
      method: "POST",
      body: JSON.stringify({
        planId: selectedPlanId,
        endsAt: new Date(endsAt).toISOString(),
        reason: reason.trim() || undefined,
      }),
    })
      .then(() => {
        setGrantModalOpen(false);
        setReason("");
        onUpdate();
        loadEvents(1);
      })
      .catch(console.error)
      .finally(() => setSaving(false));
  }, [apiFetch, user.id, selectedPlanId, endsAt, reason, onUpdate, loadEvents]);

  const handleGrantRevoke = useCallback(() => {
    if (!confirm("Revoke this user's manual grant? They will drop back to their billing-based plan.")) return;
    setSaving(true);
    apiFetch(`/users/${user.id}/grants`, { method: "DELETE" })
      .then(() => { onUpdate(); loadEvents(1); })
      .catch(console.error)
      .finally(() => setSaving(false));
  }, [apiFetch, user.id, onUpdate, loadEvents]);

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

  const activeGrant = user.activeGrant;

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

      {/* Active Manual Grant */}
      {activeGrant && (
        <div className="rounded-lg bg-[#1A2942] border border-[#F59E0B]/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-[#F59E0B]" />
              <span className="text-sm font-semibold text-[#F9FAFB]">Active Manual Grant</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={handleGrantRevoke}
              className="h-7 text-[#EF4444] hover:bg-[#EF4444]/10 border border-[#EF4444]/20"
            >
              <X className="h-3 w-3" /> Revoke
            </Button>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#9CA3AF]">Granted Plan</span>
              <Badge className={cn("text-[9px] uppercase", planBadgeClass(activeGrant.plan.slug))}>
                {activeGrant.plan.name}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9CA3AF]">Ends</span>
              <span className="text-[#F9FAFB]">
                {activeGrant.endsAt ? formatDate(activeGrant.endsAt) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9CA3AF]">Granted</span>
              <span className="text-[#F9FAFB]">{formatDate(activeGrant.grantedAt)}</span>
            </div>
            {activeGrant.reason && (
              <div className="flex justify-between">
                <span className="text-[#9CA3AF]">Reason</span>
                <span className="text-[#F9FAFB] truncate ml-4">{activeGrant.reason}</span>
              </div>
            )}
          </div>
        </div>
      )}

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
            setSelectedPlanId(activeGrant?.plan.id ?? user.plan.id);
            setEndsAt(activeGrant?.endsAt ? activeGrant.endsAt.slice(0, 10) : defaultEndsAt());
            setReason(activeGrant?.reason ?? "");
            setGrantModalOpen(true);
          }}
        >
          <CreditCard className="h-3.5 w-3.5" /> {activeGrant ? "Edit Grant" : "Grant Plan"}
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

      {/* Event Log */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-[#3B82F6]" />
            <span className="text-sm font-semibold text-[#F9FAFB]">Event Log</span>
            <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">{events.length}</Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => loadEvents(eventsPage)}
            disabled={eventsLoading}
            className="h-6 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB]"
          >
            Refresh
          </Button>
        </div>
        {eventsLoading && events.length === 0 ? (
          <p className="text-xs text-[#9CA3AF]">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-xs text-[#9CA3AF]">No billing events recorded for this user yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {events.map((ev) => {
              const isOpen = expandedEventId === ev.id;
              return (
                <div key={ev.id} className="py-2">
                  <button
                    onClick={() => setExpandedEventId(isOpen ? null : ev.id)}
                    className="w-full flex items-center gap-2 text-left hover:bg-white/5 rounded p-1 -m-1"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3 text-[#9CA3AF] flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-[#9CA3AF] flex-shrink-0" />
                    )}
                    <span className="text-[10px] text-[#9CA3AF] font-mono flex-shrink-0 w-28">
                      {new Date(ev.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Badge
                      className={cn(
                        "text-[9px] uppercase flex-shrink-0",
                        ev.source === "APPLE" && "bg-[#9CA3AF]/10 text-[#F9FAFB]",
                        ev.source === "STRIPE" && "bg-[#635BFF]/10 text-[#A5A1FF]",
                        ev.source === "MANUAL" && "bg-[#F59E0B]/10 text-[#F59E0B]",
                      )}
                    >
                      {ev.source}
                    </Badge>
                    <span className="text-xs text-[#F9FAFB] truncate flex-1 font-mono">
                      {ev.eventType}
                    </span>
                    <Badge
                      className={cn(
                        "text-[9px] uppercase flex-shrink-0",
                        ev.status === "APPLIED" && "bg-[#10B981]/10 text-[#10B981]",
                        ev.status === "SKIPPED" && "bg-[#F59E0B]/10 text-[#F59E0B]",
                        ev.status === "FAILED" && "bg-[#EF4444]/10 text-[#EF4444]",
                      )}
                    >
                      {ev.status}
                    </Badge>
                  </button>
                  {isOpen && (
                    <div className="mt-2 ml-5 space-y-1 text-[10px]">
                      {ev.skipReason && (
                        <div className="flex gap-2">
                          <span className="text-[#9CA3AF] w-20 flex-shrink-0">Reason</span>
                          <span className="text-[#F59E0B]">{ev.skipReason}</span>
                        </div>
                      )}
                      {ev.environment && (
                        <div className="flex gap-2">
                          <span className="text-[#9CA3AF] w-20 flex-shrink-0">Environment</span>
                          <span className="text-[#F9FAFB]">{ev.environment}</span>
                        </div>
                      )}
                      {ev.externalId && (
                        <div className="flex gap-2">
                          <span className="text-[#9CA3AF] w-20 flex-shrink-0">External ID</span>
                          <span className="text-[#F9FAFB] font-mono truncate">{ev.externalId}</span>
                        </div>
                      )}
                      {ev.productExternalId && (
                        <div className="flex gap-2">
                          <span className="text-[#9CA3AF] w-20 flex-shrink-0">Product</span>
                          <span className="text-[#F9FAFB] font-mono truncate">{ev.productExternalId}</span>
                        </div>
                      )}
                      <details className="mt-2">
                        <summary className="text-[#9CA3AF] cursor-pointer hover:text-[#F9FAFB]">
                          Raw payload
                        </summary>
                        <pre className="mt-1 bg-[#0F1D32] border border-white/5 rounded p-2 text-[9px] font-mono text-[#F9FAFB] overflow-auto max-h-60">
                          {JSON.stringify(ev.rawPayload, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {eventsTotalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => loadEvents(eventsPage - 1)}
              disabled={eventsLoading || eventsPage <= 1}
              className="h-6 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB]"
            >
              Prev
            </Button>
            <span className="text-[10px] text-[#9CA3AF]">
              Page {eventsPage} of {eventsTotalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => loadEvents(eventsPage + 1)}
              disabled={eventsLoading || eventsPage >= eventsTotalPages}
              className="h-6 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB]"
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Grant Plan Modal */}
      <Dialog open={grantModalOpen} onOpenChange={setGrantModalOpen}>
        <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {activeGrant ? "Edit Grant" : "Grant Plan"} — {user.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#9CA3AF]">Plan</Label>
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
            <div className="space-y-1.5">
              <Label className="text-xs text-[#9CA3AF]">Ends on (UTC)</Label>
              <Input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="bg-[#0A1628] border-white/5 text-[#F9FAFB]"
              />
              <div className="text-[10px] text-[#9CA3AF]">
                User drops back to their billing-based plan after this date.
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#9CA3AF]">Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Comp, beta tester, support issue…"
                className="bg-[#0A1628] border-white/5 text-[#F9FAFB] text-xs"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setGrantModalOpen(false)}
              className="text-[#9CA3AF]"
            >
              Cancel
            </Button>
            <Button
              className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white"
              disabled={saving || !selectedPlanId || !endsAt}
              onClick={handleGrantSave}
            >
              {saving ? "Saving..." : activeGrant ? "Update Grant" : "Grant Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
