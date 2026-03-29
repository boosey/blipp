import { useState, useEffect } from "react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { toast } from "sonner";
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
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                interval === "annual"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
            </button>
          </div>
        </div>
      )}

      <div className={`grid gap-4 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3 gap-6"}`}>
        {plans.map((plan) => {
          const isCurrent = currentPlanSlug === plan.slug;
          const isFree = plan.slug === "free" || plan.priceCentsMonthly === 0;

          return (
            <div
              key={plan.id}
              className={`rounded-xl ${compact ? "p-4" : "p-6"} flex flex-col relative ${
                isCurrent
                  ? "bg-muted border-2 border-emerald-500/50 ring-1 ring-emerald-500/20"
                  : plan.highlighted
                    ? "bg-muted border-2 border-foreground ring-1 ring-foreground/20"
                    : "bg-card border border-border"
              }`}
            >
              {isCurrent && (
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                  Your Current Plan
                </span>
              )}
              {!isCurrent && plan.highlighted && (
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Most Popular
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <h2 className={`${compact ? "text-lg" : "text-2xl"} font-bold`}>{plan.name}</h2>
                <p className={`${compact ? "text-xl" : "text-3xl"} font-bold`}>
                  {displayPrice(plan)}
                  {!isFree && (
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  )}
                </p>
              </div>
              {plan.description && (
                <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
              )}

              <ul className={`${compact ? "mt-3 space-y-1.5" : "mt-6 space-y-3"} flex-1`}>
                {(plan.features || []).map((feature) => (
                  <li
                    key={feature}
                    className={`flex items-start gap-2 ${compact ? "text-xs" : "text-sm"} text-foreground/80`}
                  >
                    <span className="text-muted-foreground mt-0.5">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <div className={compact ? "mt-3" : "mt-6"}>
                {isCurrent ? (
                  <span className="block text-center py-2 text-sm text-muted-foreground">
                    Current plan
                  </span>
                ) : isFree ? (
                  <span className="block text-center py-2 text-sm text-muted-foreground">
                    Included
                  </span>
                ) : (
                  <>
                    <SignedIn>
                      <button
                        onClick={() => handleCheckout(plan)}
                        disabled={checkoutLoading === plan.id}
                        className={`w-full py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
                          plan.highlighted
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-muted border border-border hover:bg-accent"
                        }`}
                      >
                        {checkoutLoading === plan.id ? "Redirecting..." : "Upgrade"}
                      </button>
                    </SignedIn>
                    <SignedOut>
                      <SignInButton>
                        <button
                          className={`w-full py-2 rounded-lg font-medium text-sm transition-colors ${
                            plan.highlighted
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : "bg-muted border border-border hover:bg-accent"
                          }`}
                        >
                          Get Started
                        </button>
                      </SignInButton>
                    </SignedOut>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
