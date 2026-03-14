import { Link } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import {
  Podcast,
  Sparkles,
  Headphones,
  Clock,
  CalendarCheck,
} from "lucide-react";

const steps = [
  {
    icon: Podcast,
    title: "Subscribe",
    description: "Pick your favorite podcasts from our catalog.",
  },
  {
    icon: Sparkles,
    title: "We Distill",
    description: "AI summarizes each new episode into a short audio briefing.",
  },
  {
    icon: Headphones,
    title: "You Listen",
    description: "Listen to bite-sized briefings in 1-15 minutes.",
  },
];

const features = [
  {
    icon: Sparkles,
    title: "AI-powered summaries",
    description: "Advanced AI distills key points from each episode",
  },
  {
    icon: Clock,
    title: "Choose your length",
    description: "From 1-minute headlines to 15-minute deep dives",
  },
  {
    icon: CalendarCheck,
    title: "Auto-delivered daily",
    description: "New briefings appear in your feed automatically",
  },
  {
    icon: Podcast,
    title: "Works with any podcast",
    description: "Subscribe to any podcast in our catalog of thousands",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    features: ["3 briefings per week", "Up to 5 min briefings", "3 podcast subscriptions"],
  },
  {
    name: "Pro",
    price: "$5.99",
    suffix: "/mo",
    highlighted: true,
    features: ["Unlimited briefings", "Up to 15 min briefings", "Unlimited subscriptions"],
  },
  {
    name: "Power",
    price: "$11.99",
    suffix: "/mo",
    features: ["Unlimited briefings", "Priority processing", "Early access to new features"],
  },
];

/** Public landing page with hero, how-it-works, features, pricing preview, and footer. */
export function Landing() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
          Your podcasts,
          <br />
          distilled to fit your time.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-zinc-400 max-w-2xl">
          Blipp turns hour-long podcast episodes into short audio briefings you
          can listen to in minutes. AI-powered, on your schedule.
        </p>
        <div className="flex gap-4 mt-8">
          <SignedOut>
            <SignInButton>
              <button className="px-6 py-3 bg-zinc-50 text-zinc-950 font-semibold rounded-lg hover:bg-zinc-200 transition-colors">
                Start Free
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link
              to="/home"
              className="px-6 py-3 bg-zinc-50 text-zinc-950 font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
            >
              Go to Feed
            </Link>
          </SignedIn>
          <Link
            to="/pricing"
            className="px-6 py-3 border border-zinc-700 text-zinc-300 font-semibold rounded-lg hover:bg-zinc-900 transition-colors"
          >
            See Pricing
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6">
        <h2 className="text-3xl font-bold text-center mb-16">How It Works</h2>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                <step.icon className="w-6 h-6 text-zinc-300" />
              </div>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-sm text-zinc-400">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6 bg-zinc-900/50">
        <h2 className="text-3xl font-bold text-center mb-16">Features</h2>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, i) => (
            <div
              key={i}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-6"
            >
              <feature.icon className="w-6 h-6 text-zinc-400 mb-3" />
              <h3 className="text-lg font-semibold mb-1">{feature.title}</h3>
              <p className="text-sm text-zinc-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-24 px-6">
        <h2 className="text-3xl font-bold text-center mb-4">Pricing</h2>
        <p className="text-zinc-400 text-center mb-12">
          Choose the plan that fits your listening.
        </p>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
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
              <h3 className="text-2xl font-bold">{plan.name}</h3>
              <p className="text-3xl font-bold mt-2">
                {plan.price}
                {plan.suffix && (
                  <span className="text-base font-normal text-zinc-400">
                    {plan.suffix}
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
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link
            to="/pricing"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            View all plans &rarr;
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 px-6 text-center text-sm text-zinc-500">
        <div className="flex justify-center gap-6">
          <Link to="/pricing" className="hover:text-zinc-300 transition-colors">
            Pricing
          </Link>
          <a href="#" className="hover:text-zinc-300 transition-colors">
            Privacy
          </a>
          <a href="#" className="hover:text-zinc-300 transition-colors">
            Terms
          </a>
        </div>
        <p className="mt-4">&copy; 2026 Blipp</p>
      </footer>
    </div>
  );
}
