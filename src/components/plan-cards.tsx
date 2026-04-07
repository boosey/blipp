import { useState, useEffect } from "react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Sparkles, Check, Star } from "lucide-react";
import { apiFetch } from "../lib/api";

export interface Plan {
  id: string;
  slug: string;
  name: string;
  description?: string;
  priceCentsMonthly: number;
  priceCentsAnnual?: number | null;
  features: string[];
  highlighted: boolean;
}

interface PlanCardsProps {
  currentPlanSlug?: string | null;
  onCheckout?: (plan: Plan) => void;
  compact?: boolean;
}

/**
 * Shared plan cards component used by both the pricing page and the upgrade modal.
 * Fetches plans from the API and renders them as cards.
 */
export function PlanCards({ currentPlanSlug, onCheckout, compact }: PlanCardsProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");

  useEffect(() => {
    apiFetch<Plan[]>("/plans")
      .then(setPlans)
      .catch(() => toast.error("Failed to load plans"))
      .finally(() => setLoading(false));
  }, []);

  const hasAnnual = plans.some((p) => p.priceCentsAnnual != null && p.priceCentsAnnual > 0);

  async function handleCheckout(plan: Plan) {
    if (onCheckout) {
      onCheckout(plan);
      return;
    }
    setCheckoutLoading(plan.id);
    try {
      const { url } = await apiFetch<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId: plan.id, interval }),
      });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start checkout");
      setCheckoutLoading(null);
    }
  }

  function displayPrice(plan: Plan): string {
    if (plan.priceCentsMonthly === 0) return "Free";
    const cents =
      interval === "annual" && plan.priceCentsAnnual
        ? Math.round(plan.priceCentsAnnual / 12)
        : plan.priceCentsMonthly;
    return `$${(cents / 100).toFixed(2)}`;
  }

  function annualSavingsPercent(plan: Plan): number | null {
    if (!plan.priceCentsAnnual || plan.priceCentsMonthly === 0) return null;
    const monthlyTotal = plan.priceCentsMonthly * 12;
    const savings = Math.round(((monthlyTotal - plan.priceCentsAnnual) / monthlyTotal) * 100);
    return savings > 0 ? savings : null;
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm text-center py-8">Loading plans...</p>;
  }

  return (
    <div>
      {hasAnnual && (
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center bg-card rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setInterval("monthly")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                interval === "monthly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("annual")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors relative ${
                interval === "annual"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
              {interval !== "annual" && (
                <span className="absolute -top-2.5 -right-2 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
                  Save
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      <div className={`grid gap-4 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3 gap-6"} items-start`}>
        {plans.map((plan, idx) => {
          const isCurrent = currentPlanSlug === plan.slug;
          const currentIdx = plans.findIndex((p) => p.slug === currentPlanSlug);
          const isUpgrade = currentIdx >= 0 && idx > currentIdx;
          const isNextUp = currentIdx >= 0 && idx === currentIdx + 1;
          const isFree = plan.priceCentsMonthly === 0;
          const savings = interval === "annual" ? annualSavingsPercent(plan) : null;

          return (
            <div
              key={plan.id}
              className={`rounded-xl ${compact ? "p-4" : "p-6"} flex flex-col relative transition-all duration-300 ${
                isCurrent
                  ? "bg-emerald-950/30 border-2 border-emerald-500/60 ring-1 ring-emerald-500/20"
                  : plan.highlighted
                    ? `plan-card-glow bg-card border-2 border-primary/60 ring-1 ring-primary/30 ${!compact ? "md:scale-105 md:z-10" : ""}`
                    : "bg-card border border-border hover:border-muted-foreground/30"
              }`}
            >
              {/* Badge */}
              {isCurrent && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">
                  <Check className="w-3 h-3" />
                  Your Current Plan
                </span>
              )}
              {!isCurrent && plan.highlighted && (
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-primary mb-2">
                  <Star className="w-3 h-3 fill-current" />
                  Recommended
                </span>
              )}

              {/* Plan name + price */}
              <div className="flex items-baseline justify-between">
                <h2 className={`${compact ? "text-lg" : "text-2xl"} font-bold ${plan.highlighted && !isCurrent ? "text-foreground" : ""}`}>
                  {plan.name}
                </h2>
                <div className="text-right">
                  <p className={`${compact ? "text-xl" : "text-3xl"} font-bold ${plan.highlighted && !isCurrent ? "text-primary" : ""}`}>
                    {displayPrice(plan)}
                    {!isFree && (
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    )}
                  </p>
                  {savings && (
                    <span className="text-[11px] font-semibold text-emerald-400">
                      Save {savings}% annually
                    </span>
                  )}
                </div>
              </div>

              {plan.description && (
                <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
              )}

              {/* Features */}
              <ul className={`${compact ? "mt-3 space-y-1.5" : "mt-6 space-y-3"} flex-1`}>
                {(plan.features || []).map((feature) => (
                  <li
                    key={feature}
                    className={`flex items-start gap-2 ${compact ? "text-xs" : "text-sm"} text-foreground/80`}
                  >
                    <Check className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                      plan.highlighted && !isCurrent
                        ? "text-primary"
                        : isCurrent
                          ? "text-emerald-400"
                          : "text-muted-foreground"
                    }`} />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className={compact ? "mt-3" : "mt-6"}>
                {isCurrent ? (
                  <span className="block text-center py-2 text-sm text-emerald-400/70 font-medium">
                    Current plan
                  </span>
                ) : isUpgrade ? (
                  <>
                    <SignedIn>
                      <button
                        onClick={() => handleCheckout(plan)}
                        disabled={checkoutLoading === plan.id}
                        className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 ${
                          plan.highlighted || isNextUp
                            ? "plan-cta-shimmer bg-primary text-primary-foreground hover:brightness-110 shadow-lg shadow-primary/25"
                            : "bg-muted border border-border hover:bg-accent hover:border-muted-foreground/30"
                        }`}
                      >
                        <span className="relative z-10 flex items-center justify-center gap-1.5">
                          {plan.highlighted && <Sparkles className="w-3.5 h-3.5" />}
                          {checkoutLoading === plan.id ? "Redirecting..." : "Upgrade"}
                        </span>
                      </button>
                    </SignedIn>
                    <SignedOut>
                      <SignInButton>
                        <button
                          className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
                            plan.highlighted || isNextUp
                              ? "plan-cta-shimmer bg-primary text-primary-foreground hover:brightness-110 shadow-lg shadow-primary/25"
                              : "bg-muted border border-border hover:bg-accent hover:border-muted-foreground/30"
                          }`}
                        >
                          <span className="relative z-10 flex items-center justify-center gap-1.5">
                            {plan.highlighted && <Sparkles className="w-3.5 h-3.5" />}
                            Get Started
                          </span>
                        </button>
                      </SignInButton>
                    </SignedOut>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
