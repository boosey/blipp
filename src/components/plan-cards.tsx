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
  briefingsPerWeek: number | null;
  maxDurationMinutes: number;
  maxPodcastSubscriptions: number | null;
  adFree: boolean;
  priorityProcessing: boolean;
  earlyAccess: boolean;
  highlighted: boolean;
}

export function buildFeatures(plan: Plan): string[] {
  const features: string[] = [];

  if (plan.briefingsPerWeek === null) {
    features.push("Unlimited briefings");
  } else {
    features.push(`${plan.briefingsPerWeek} briefings per week`);
  }

  features.push(`Up to ${plan.maxDurationMinutes} min briefings`);

  if (plan.maxPodcastSubscriptions === null) {
    features.push("Unlimited podcast subscriptions");
  } else if (plan.maxPodcastSubscriptions > 0) {
    features.push(`${plan.maxPodcastSubscriptions} podcast subscriptions`);
  }

  if (plan.adFree) features.push("Ad-free listening");
  if (plan.priorityProcessing) features.push("Priority processing");
  if (plan.earlyAccess) features.push("Early access to new features");

  return features;
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
    return <p className="text-zinc-400 text-sm text-center py-8">Loading plans...</p>;
  }

  return (
    <div>
      {hasAnnual && (
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
            <button
              onClick={() => setInterval("monthly")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                interval === "monthly"
                  ? "bg-zinc-50 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("annual")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                interval === "annual"
                  ? "bg-zinc-50 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
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
                  ? "bg-zinc-800 border-2 border-emerald-500/50 ring-1 ring-emerald-500/20"
                  : plan.highlighted
                    ? "bg-zinc-800 border-2 border-zinc-50 ring-1 ring-zinc-50/20"
                    : "bg-zinc-900 border border-zinc-800"
              }`}
            >
              {isCurrent && (
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                  Your Current Plan
                </span>
              )}
              {!isCurrent && plan.highlighted && (
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Most Popular
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <h2 className={`${compact ? "text-lg" : "text-2xl"} font-bold`}>{plan.name}</h2>
                <p className={`${compact ? "text-xl" : "text-3xl"} font-bold`}>
                  {displayPrice(plan)}
                  {!isFree && (
                    <span className="text-sm font-normal text-zinc-400">/mo</span>
                  )}
                </p>
              </div>
              {plan.description && (
                <p className="text-xs text-zinc-400 mt-1">{plan.description}</p>
              )}

              <ul className={`${compact ? "mt-3 space-y-1.5" : "mt-6 space-y-3"} flex-1`}>
                {buildFeatures(plan).map((feature) => (
                  <li
                    key={feature}
                    className={`flex items-start gap-2 ${compact ? "text-xs" : "text-sm"} text-zinc-300`}
                  >
                    <span className="text-zinc-500 mt-0.5">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <div className={compact ? "mt-3" : "mt-6"}>
                {isCurrent ? (
                  <span className="block text-center py-2 text-sm text-zinc-500">
                    Current plan
                  </span>
                ) : isFree ? (
                  <span className="block text-center py-2 text-sm text-zinc-500">
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
                            ? "bg-zinc-50 text-zinc-950 hover:bg-zinc-200"
                            : "bg-zinc-800 border border-zinc-700 hover:bg-zinc-700"
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
                              ? "bg-zinc-50 text-zinc-950 hover:bg-zinc-200"
                              : "bg-zinc-800 border border-zinc-700 hover:bg-zinc-700"
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
