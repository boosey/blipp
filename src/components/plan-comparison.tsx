import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Star, Sparkles } from "lucide-react";
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
        return (
          <div
            key={p.id}
            className={`bg-card border rounded-xl p-4 space-y-3 transition-all ${
              isCurrent
                ? "border-emerald-500/60 bg-emerald-950/20"
                : p.highlighted
                  ? "plan-card-glow border-primary/50 ring-1 ring-primary/20"
                  : "border-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{p.name}</h3>
                  {!isCurrent && p.highlighted && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      <Star className="w-2.5 h-2.5 fill-current" />
                      Best value
                    </span>
                  )}
                </div>
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
                  <span className={`text-sm font-medium ${p.highlighted && !isCurrent ? "text-primary" : ""}`}>
                    ${(p.priceCentsMonthly / 100).toFixed(2)}/mo
                  </span>
                )}
              </div>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              {(p.features || []).map((f) => (
                <li key={f} className="flex items-start gap-1.5">
                  <Check className={`w-3 h-3 mt-0.5 flex-shrink-0 ${
                    isCurrent
                      ? "text-emerald-400"
                      : p.highlighted
                        ? "text-primary"
                        : "text-muted-foreground"
                  }`} />
                  {f}
                </li>
              ))}
            </ul>
            {isCurrent ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full font-medium">
                    <Check className="w-3 h-3" />
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
                className={`w-full py-2 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 ${
                  p.highlighted
                    ? "plan-cta-shimmer bg-primary text-primary-foreground hover:brightness-110 shadow-md shadow-primary/20"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                <span className="relative z-10 flex items-center justify-center gap-1">
                  {p.highlighted && <Sparkles className="w-3 h-3" />}
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
