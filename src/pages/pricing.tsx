import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/clerk-react";
import { toast } from "sonner";
import { apiFetch } from "../lib/api";

interface Plan {
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

function buildFeatures(plan: Plan): string[] {
  const features: string[] = [];

  // Briefings per week
  if (plan.briefingsPerWeek === null) {
    features.push("Unlimited briefings");
  } else {
    features.push(`${plan.briefingsPerWeek} briefings per week`);
  }

  // Max duration
  features.push(`Up to ${plan.maxDurationMinutes} min briefings`);

  // Podcast subscriptions
  if (plan.maxPodcastSubscriptions === null) {
    features.push("Unlimited podcast subscriptions");
  } else if (plan.maxPodcastSubscriptions > 0) {
    features.push(`${plan.maxPodcastSubscriptions} podcast subscriptions`);
  }

  // Feature flags
  if (plan.adFree) features.push("Ad-free listening");
  if (plan.priorityProcessing) features.push("Priority processing");
  if (plan.earlyAccess) features.push("Early access to new features");

  return features;
}

export function Pricing() {
  const { user } = useUser();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [currentPlanSlug, setCurrentPlanSlug] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Plan[]>("/plans")
      .then((data) => {
        setPlans(data);
      })
      .catch(() => toast.error("Failed to load pricing plans"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) {
      apiFetch<{ user: { plan: { slug: string } } }>("/me")
        .then((r) => setCurrentPlanSlug(r.user.plan.slug))
        .catch(() => toast.error("Failed to load current plan"));
    }
  }, [user]);

  const hasAnnual = plans.some((p) => p.priceCentsAnnual != null && p.priceCentsAnnual > 0);

  async function handleCheckout(plan: Plan) {
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
    const cents = interval === "annual" && plan.priceCentsAnnual
      ? Math.round(plan.priceCentsAnnual / 12)
      : plan.priceCentsMonthly;
    return `$${(cents / 100).toFixed(2)}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center">
        <p className="text-zinc-400">Loading plans...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2">Pricing</h1>
        <p className="text-zinc-400 text-center mb-8">
          Choose the plan that fits your listening.
        </p>

        {hasAnnual && (
          <div className="flex justify-center mb-8">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = currentPlanSlug === plan.slug;
            const isFree = plan.slug === "free" || plan.priceCentsMonthly === 0;
            return (
              <div
                key={plan.id}
                className={`rounded-xl p-6 flex flex-col ${
                  plan.highlighted
                    ? "bg-zinc-800 border-2 border-zinc-50 ring-1 ring-zinc-50/20"
                    : "bg-zinc-900 border border-zinc-800"
                }`}
              >
                {plan.highlighted && (
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    Most Popular
                  </span>
                )}
                <h2 className="text-2xl font-bold">{plan.name}</h2>
                {plan.description && (
                  <p className="text-sm text-zinc-400 mt-1">{plan.description}</p>
                )}
                <p className="text-3xl font-bold mt-2">
                  {displayPrice(plan)}
                  {!isFree && (
                    <span className="text-base font-normal text-zinc-400">
                      /mo
                    </span>
                  )}
                </p>
                {interval === "annual" && plan.priceCentsAnnual != null && plan.priceCentsAnnual > 0 && (
                  <p className="text-xs text-zinc-500 mt-1">
                    ${(plan.priceCentsAnnual / 100).toFixed(2)} billed annually
                  </p>
                )}

                <ul className="mt-6 space-y-3 flex-1">
                  {buildFeatures(plan).map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-zinc-300"
                    >
                      <span className="text-zinc-500 mt-0.5">&#10003;</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
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
                          className={`w-full py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                            plan.highlighted
                              ? "bg-zinc-50 text-zinc-950 hover:bg-zinc-200"
                              : "bg-zinc-800 border border-zinc-700 hover:bg-zinc-700"
                          }`}
                        >
                          {checkoutLoading === plan.id
                            ? "Redirecting..."
                            : "Upgrade"}
                        </button>
                      </SignedIn>
                      <SignedOut>
                        <SignInButton>
                          <button
                            className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
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

        <div className="text-center mt-8">
          <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
