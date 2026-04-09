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
}

export function PlanComparison({
  currentPlanSlug,
  subscriptionEndsAt,
  onUpgrade,
  onManage,
  actionLoading,
}: {
  currentPlanSlug: string | null;
  subscriptionEndsAt?: string | null;
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
      {plans.map((p, idx) => {
        const isCurrent = currentPlanSlug === p.slug;
        const currentIdx = plans.findIndex((pl) => pl.slug === currentPlanSlug);
        const isUpgrade = currentIdx >= 0 && idx > currentIdx;
        const isBelow = currentIdx >= 0 && idx < currentIdx;
        const isTopTier = idx === plans.length - 1;

        let cardClass: string;
        if (isCurrent) {
          cardClass = "bg-card border-2 border-primary ring-1 ring-primary/30";
        } else if (isBelow) {
          cardClass = "bg-card border border-border";
        } else if (isUpgrade && isTopTier) {
          cardClass = "plan-card-glow-gold bg-card border-2 border-amber-500/50 ring-1 ring-amber-500/20";
        } else if (isUpgrade) {
          cardClass = "plan-card-glow bg-card border-2 border-primary/60 ring-1 ring-primary/30";
        } else {
          cardClass = "bg-card border border-border";
        }

        return (
          <div
            key={p.id}
            className={`rounded-xl p-4 space-y-3 transition-all duration-300 ${cardClass}`}
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
              {(p.features || []).map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
            {isCurrent ? (
              <div className="space-y-2">
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
                {subscriptionEndsAt && (
                  <p className="text-xs text-amber-500">
                    Your subscription ends{" "}
                    {new Date(subscriptionEndsAt).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            ) : isUpgrade ? (
              <button
                onClick={() => onUpgrade(p)}
                disabled={actionLoading === p.id}
                className={`w-full py-2.5 rounded-lg font-semibold text-xs transition-all disabled:opacity-50 ${
                  isTopTier
                    ? "plan-cta-shimmer bg-amber-500 text-amber-950 hover:brightness-110 shadow-lg shadow-amber-500/25"
                    : "plan-cta-shimmer bg-primary text-primary-foreground hover:brightness-110 shadow-lg shadow-primary/25"
                }`}
              >
                <span className="relative z-10">
                  {actionLoading === p.id
                    ? "Redirecting..."
                    : `Upgrade to ${p.name}`}
                </span>
              </button>
            ) : currentIdx >= 0 ? (
              <button
                onClick={onManage}
                disabled={actionLoading === "manage"}
                className="w-full py-2 border border-border text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
              >
                {actionLoading === "manage"
                  ? "Redirecting..."
                  : `Downgrade to ${p.name}`}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
