import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useApiFetch } from "../lib/api";
import { Skeleton } from "./ui/skeleton";

export interface PlanDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCentsMonthly: number;
  priceCentsAnnual: number | null;
  features: string[];
  highlighted: boolean;
  briefingsPerWeek: number | null;
  maxDurationMinutes: number;
  maxPodcastSubscriptions: number | null;
  adFree: boolean;
  priorityProcessing: boolean;
  earlyAccess: boolean;
}

export function PlanComparison({
  currentPlanSlug,
  onUpgrade,
  onManage,
  actionLoading,
}: {
  currentPlanSlug: string | null;
  onUpgrade: (plan: PlanDetail) => void;
  onManage: () => void;
  actionLoading: string | null;
}) {
  const apiFetch = useApiFetch();
  const [plans, setPlans] = useState<PlanDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<PlanDetail[]>("/plans")
      .then(setPlans)
      .catch(() => toast.error("Failed to load plans"))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {plans.map((p) => {
        const isCurrent = currentPlanSlug === p.slug;
        return (
          <div
            key={p.id}
            className={`bg-card border rounded-xl p-4 space-y-3 ${
              isCurrent
                ? "border-foreground"
                : p.highlighted
                  ? "border-muted-foreground/40"
                  : "border-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{p.name}</h3>
                {p.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.description}
                  </p>
                )}
              </div>
              <div className="text-right">
                {p.priceCentsMonthly === 0 ? (
                  <span className="text-sm font-medium">Free</span>
                ) : (
                  <span className="text-sm font-medium">
                    ${(p.priceCentsMonthly / 100).toFixed(2)}/mo
                  </span>
                )}
              </div>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>· {p.briefingsPerWeek ?? "Unlimited"} briefings/week</li>
              <li>· Up to {p.maxDurationMinutes}min per briefing</li>
              <li>· {p.maxPodcastSubscriptions ?? "Unlimited"} subscriptions</li>
              {p.adFree && <li className="text-green-400">· Ad-free</li>}
              {p.priorityProcessing && <li className="text-green-400">· Priority processing</li>}
              {p.earlyAccess && <li className="text-green-400">· Early access</li>}
            </ul>
            {isCurrent ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                  Current Plan
                </span>
                {p.priceCentsMonthly > 0 && (
                  <button
                    onClick={onManage}
                    disabled={actionLoading === "manage"}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {actionLoading === "manage" ? "..." : "Manage"}
                  </button>
                )}
              </div>
            ) : p.priceCentsMonthly > 0 ? (
              <button
                onClick={() => onUpgrade(p)}
                disabled={actionLoading === p.id}
                className="w-full py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {actionLoading === p.id
                  ? "Redirecting..."
                  : `Upgrade to ${p.name}`}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
