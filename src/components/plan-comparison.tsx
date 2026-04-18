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
  onUpgrade: (plan: PlanDetail, interval: "monthly" | "annual") => void;
  onManage: () => void;
  actionLoading: string | null;
}) {
  const apiFetch = useApiFetch();
  const [plans, setPlans] = useState<PlanDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [interval, setBillingInterval] = useState<"monthly" | "annual">("monthly");

  useEffect(() => {
    apiFetch<PlanDetail[]>("/plans")
      .then(setPlans)
      .catch(() => toast.error("Failed to load plans"))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  const hasAnnual = plans.some((p) => p.priceCentsAnnual != null && p.priceCentsAnnual > 0);

  function displayPrice(p: PlanDetail): string {
    if (p.priceCentsMonthly === 0) return "Free";
    const cents =
      interval === "annual" && p.priceCentsAnnual
        ? Math.round(p.priceCentsAnnual / 12)
        : p.priceCentsMonthly;
    return `$${(cents / 100).toFixed(2)}`;
  }

  function annualSavingsPercent(p: PlanDetail): number | null {
    if (!p.priceCentsAnnual || p.priceCentsMonthly === 0) return null;
    const monthlyTotal = p.priceCentsMonthly * 12;
    const savings = Math.round(((monthlyTotal - p.priceCentsAnnual) / monthlyTotal) * 100);
    return savings > 0 ? savings : null;
  }

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
      {hasAnnual && (
        <div className="flex justify-center">
          <div className="relative inline-flex items-center bg-card rounded-full p-1 border border-border">
            <span
              aria-hidden
              className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary shadow-sm transition-transform duration-300 ease-out"
              style={{
                transform: interval === "annual" ? "translateX(100%)" : "translateX(0)",
              }}
            />
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              className={`relative z-10 px-5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                interval === "monthly" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("annual")}
              className={`relative z-10 px-5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                interval === "annual" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
            </button>
          </div>
        </div>
      )}
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
                  <>
                    <span className="text-sm font-medium">{displayPrice(p)}/mo</span>
                    {interval === "annual" && annualSavingsPercent(p) && (
                      <p className="text-[10px] font-semibold text-emerald-400 mt-0.5">
                        Save {annualSavingsPercent(p)}% annually
                      </p>
                    )}
                  </>
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
                onClick={() => onUpgrade(p, interval)}
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
