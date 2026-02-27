import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/clerk-react";
import { apiFetch } from "../lib/api";

interface Plan {
  id: string;
  tier: string;
  name: string;
  priceCents: number;
  features: string[];
  highlighted: boolean;
}

export function Pricing() {
  const { user } = useUser();
  const currentTier = (user?.publicMetadata?.tier as string) || "FREE";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Plan[]>("/plans")
      .then(setPlans)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCheckout(tier: string) {
    setCheckoutLoading(tier);
    try {
      const { url } = await apiFetch<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ tier }),
      });
      window.location.href = url;
    } catch {
      setCheckoutLoading(null);
    }
  }

  function formatPrice(cents: number) {
    return cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)}`;
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
        <p className="text-zinc-400 text-center mb-12">
          Choose the plan that fits your listening.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = currentTier === plan.tier;
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
                <p className="text-3xl font-bold mt-2">
                  {formatPrice(plan.priceCents)}
                  {plan.priceCents > 0 && (
                    <span className="text-base font-normal text-zinc-400">
                      /mo
                    </span>
                  )}
                </p>

                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((feature) => (
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
                  ) : plan.tier === "FREE" ? (
                    <span className="block text-center py-2 text-sm text-zinc-500">
                      Included
                    </span>
                  ) : (
                    <>
                      <SignedIn>
                        <button
                          onClick={() => handleCheckout(plan.tier)}
                          disabled={checkoutLoading === plan.tier}
                          className={`w-full py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                            plan.highlighted
                              ? "bg-zinc-50 text-zinc-950 hover:bg-zinc-200"
                              : "bg-zinc-800 border border-zinc-700 hover:bg-zinc-700"
                          }`}
                        >
                          {checkoutLoading === plan.tier
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
