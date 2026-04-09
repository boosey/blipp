import { Link } from "react-router-dom";
import { Search, Sparkles, Headphones, Bell } from "lucide-react";
import { SignInButton } from "@clerk/clerk-react";

const steps = [
  {
    icon: Search,
    number: "01",
    title: "Find any podcast",
    description:
      "Search our catalog of thousands of podcasts or paste an RSS feed URL. Blipp works with any show — from top charts to niche indie pods.",
    color: "from-cyan-400 to-blue-500",
  },
  {
    icon: Sparkles,
    number: "02",
    title: "AI summarizes the episode",
    description:
      "Our AI pipeline transcribes the full episode, extracts key insights, and generates a concise summary — preserving the important ideas while cutting the filler.",
    color: "from-violet-400 to-purple-500",
  },
  {
    icon: Headphones,
    number: "03",
    title: "Listen to a voice-narrated Blipp",
    description:
      "Choose your preferred length — 2, 5, 10, 15, or 30 minutes — and listen to a natural-sounding voice summary. Get the signal without the noise.",
    color: "from-orange-400 to-rose-500",
  },
  {
    icon: Bell,
    number: "04",
    title: "Subscribe and stay current",
    description:
      "Subscribe to your favorite shows and get a fresh Blipp automatically whenever a new episode drops. No more falling behind on podcasts.",
    color: "from-emerald-400 to-teal-500",
  },
];

export function HowItWorks() {
  return (
    <div className="min-h-screen bg-[#06060e] text-white overflow-hidden">
      <div className="max-w-4xl mx-auto px-6 py-20">
        <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          &larr; Back to home
        </Link>

        <h1 className="font-sora text-4xl md:text-5xl font-800 mt-8 mb-4">
          How Blipp Works
        </h1>
        <p className="font-dm text-lg text-zinc-400 max-w-2xl mb-16">
          Blipp is a podcast summary app that turns full episodes into short,
          voice-narrated AI podcast notes — so you can keep up with more shows
          in less time.
        </p>

        <div className="space-y-12">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-6 items-start">
              <div
                className={`flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center`}
              >
                <step.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="font-sora text-xs font-700 text-zinc-500 uppercase tracking-widest">
                  Step {step.number}
                </span>
                <h2 className="font-sora text-xl font-700 text-white mt-1 mb-2">
                  {step.title}
                </h2>
                <p className="font-dm text-zinc-400 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Why Blipp */}
        <div className="mt-20 pt-12 border-t border-white/[0.06]">
          <h2 className="font-sora text-2xl font-700 text-white mb-6">
            Why people use Blipp
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: "Save hours every week",
                text: "A typical podcast episode is 60–90 minutes. A Blipp gives you the key takeaways in as little as 2 minutes.",
              },
              {
                title: "Never miss an episode",
                text: "Subscribe once and Blipp delivers summaries automatically — even for shows you don't have time to listen to in full.",
              },
              {
                title: "Decide what's worth your time",
                text: "Use a quick Blipp to triage episodes. If something sounds great, tap through to the original episode.",
              },
              {
                title: "Works with any podcast",
                text: "Blipp supports thousands of podcasts across every category — tech, business, true crime, comedy, and more.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]"
              >
                <h3 className="font-sora text-base font-600 text-white mb-2">
                  {item.title}
                </h3>
                <p className="font-dm text-sm text-zinc-400 leading-relaxed">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="font-dm text-zinc-400 mb-4">
            Ready to reclaim your podcast time?
          </p>
          <SignInButton mode="modal">
            <button className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 text-white font-sora font-600 text-sm hover:opacity-90 transition-opacity cursor-pointer">
              Get started free
            </button>
          </SignInButton>
        </div>
      </div>
    </div>
  );
}
