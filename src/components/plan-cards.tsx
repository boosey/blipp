import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Sparkles, Check, Star } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { apiFetch } from "../lib/api";
import { useIAP } from "../hooks/use-iap";

export interface Plan {
  id: string;
  slug: string;
  name: string;
  description?: string;
  priceCentsMonthly: number;
  priceCentsAnnual?: number | null;
  features: string[];
  highlighted: boolean;
  appleProductIdMonthly?: string | null;
  appleProductIdAnnual?: string | null;
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
  const isNative = Capacitor.isNativePlatform();
  const { purchase, restore, billingStatus } = useIAP();

  useEffect(() => {
    apiFetch<Plan[]>("/plans")
      .then(setPlans)
      .catch(() => toast.error("Failed to load plans"))
      .finally(() => setLoading(false));
  }, []);

  const hasAnnual = plans.some((p) => p.priceCentsAnnual != null && p.priceCentsAnnual > 0);
  // If user already subscribes via the other channel, block checkout to avoid double-billing.
  const hasActiveAppleSub = billingStatus?.activeSources.includes("APPLE") ?? false;
  const hasActiveStripeSub = billingStatus?.activeSources.includes("STRIPE") ?? false;
  const blockedCrossChannel =
    (isNative && hasActiveStripeSub) || (!isNative && hasActiveAppleSub);

  async function handleCheckout(plan: Plan) {
    if (onCheckout) {
      onCheckout(plan);
      return;
    }

    if (isNative) {
      const productId =
        interval === "annual" ? plan.appleProductIdAnnual : plan.appleProductIdMonthly;
      if (!productId) {
        toast.error(`No App Store product configured for ${interval} billing`);
        return;
      }
      setCheckoutLoading(plan.id);
      try {
        await purchase(productId);
        toast.success("Subscription activated");
      } catch (e) {
        // Apple cancellation surfaces as an error — swallow it silently.
        const msg = e instanceof Error ? e.message : String(e);
        if (!/cancel/i.test(msg)) toast.error(msg || "Purchase failed");
      } finally {
        setCheckoutLoading(null);
      }
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

  async function handleRestore() {
    try {
      await restore();
      toast.success("Purchases restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
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

  const lastIdx = plans.length - 1;

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
          const isBelow = currentIdx >= 0 && idx < currentIdx;
          const isTopTier = idx === lastIdx;
          const isFree = plan.priceCentsMonthly === 0;
          const savings = interval === "annual" ? annualSavingsPercent(plan) : null;

          // Rank-relative styling:
          // - Below current plan → plain (like free card)
          // - Current plan → thick blue/purple border
          // - Above current, top tier → golden glow
          // - Above current, not top → blue/purple glow
          let cardClass: string;
          if (isCurrent) {
            cardClass = "bg-card border-3 border-primary ring-1 ring-primary/30";
          } else if (isBelow) {
            cardClass = "bg-card border border-border";
          } else if (isUpgrade && isTopTier) {
            cardClass = `plan-card-glow-gold bg-card border-2 border-amber-500/50 ring-1 ring-amber-500/20 ${!compact ? "md:scale-105 md:z-10" : ""}`;
          } else if (isUpgrade) {
            cardClass = "plan-card-glow bg-card border-2 border-primary/60 ring-1 ring-primary/30";
          } else {
            // No current plan set (signed out) — plain styling
            cardClass = "bg-card border border-border";
          }

          return (
            <div
              key={plan.id}
              className={`rounded-xl ${compact ? "p-4" : "p-6"} flex flex-col relative transition-all duration-300 ${cardClass}`}
            >
              {/* Badge */}
              {isCurrent && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-primary mb-2">
                  <Check className="w-3 h-3" />
                  Your Current Plan
                </span>
              )}
              {isUpgrade && isTopTier && (
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                  <Star className="w-3 h-3 fill-current" />
                  Best Experience
                </span>
              )}
              {isUpgrade && !isTopTier && (
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-primary mb-2">
                  <Star className="w-3 h-3 fill-current" />
                  Recommended
                </span>
              )}

              {/* Plan name + price */}
              <div className="flex items-baseline justify-between">
                <h2 className={`${compact ? "text-lg" : "text-2xl"} font-bold`}>
                  {plan.name}
                </h2>
                <div className="text-right">
                  <p className={`${compact ? "text-xl" : "text-3xl"} font-bold ${
                    isUpgrade && isTopTier
                      ? "text-amber-400"
                      : isUpgrade
                        ? "text-primary"
                        : ""
                  }`}>
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
                      isUpgrade && isTopTier
                        ? "text-amber-400"
                        : isUpgrade
                          ? "text-primary"
                          : isCurrent
                            ? "text-primary"
                            : "text-muted-foreground"
                    }`} />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className={compact ? "mt-3" : "mt-6"}>
                {isCurrent ? (
                  <span className="block text-center py-2 text-sm text-primary/70 font-medium">
                    Current plan
                  </span>
                ) : isUpgrade && blockedCrossChannel ? (
                  <span className="block text-center py-2 text-xs text-muted-foreground">
                    {isNative
                      ? "Manage your existing web subscription to switch plans"
                      : "Manage your existing App Store subscription to switch plans"}
                  </span>
                ) : isUpgrade ? (
                  <>
                    <SignedIn>
                      <button
                        onClick={() => handleCheckout(plan)}
                        disabled={checkoutLoading === plan.id}
                        className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 ${
                          isTopTier
                            ? "plan-cta-shimmer bg-amber-500 text-amber-950 hover:brightness-110 shadow-lg shadow-amber-500/25"
                            : "plan-cta-shimmer bg-primary text-primary-foreground hover:brightness-110 shadow-lg shadow-primary/25"
                        }`}
                      >
                        <span className="relative z-10 flex items-center justify-center gap-1.5">
                          {isTopTier && <Sparkles className="w-3.5 h-3.5" />}
                          {checkoutLoading === plan.id ? "Redirecting..." : "Upgrade"}
                        </span>
                      </button>
                    </SignedIn>
                    <SignedOut>
                      <SignInButton>
                        <button
                          className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
                            isTopTier
                              ? "plan-cta-shimmer bg-amber-500 text-amber-950 hover:brightness-110 shadow-lg shadow-amber-500/25"
                              : "plan-cta-shimmer bg-primary text-primary-foreground hover:brightness-110 shadow-lg shadow-primary/25"
                          }`}
                        >
                          <span className="relative z-10 flex items-center justify-center gap-1.5">
                            {isTopTier && <Sparkles className="w-3.5 h-3.5" />}
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

      {isNative && (
        <>
          <div className="text-center mt-6">
            <button
              onClick={handleRestore}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Restore purchases
            </button>
          </div>
          <div className="mt-6 px-4 text-[11px] text-muted-foreground leading-relaxed max-w-md mx-auto text-center space-y-2">
            <p>
              Subscriptions automatically renew at the end of each {interval === "annual" ? "annual" : "monthly"} billing period
              unless cancelled at least 24 hours before renewal. Payment is charged to your
              Apple ID at confirmation of purchase.
            </p>
            <p>
              Manage or cancel your subscription in your device's Settings under Apple ID
              &rarr; Subscriptions. Unused portions of a free trial, if offered, are forfeited
              when purchasing a subscription.
            </p>
            <p>
              <Link to="/tos" className="underline hover:text-foreground">
                Terms of Service
              </Link>
              {" · "}
              <Link to="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
