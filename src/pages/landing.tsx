import { SignInButton } from "@clerk/clerk-react";
import { Search, Clock, Podcast } from "lucide-react";

const features = [
  {
    icon: Search,
    title: "Search any podcast",
    description: "Find an episode and instantly create a Blipp.",
    color: "from-cyan-400 to-blue-500",
  },
  {
    icon: Clock,
    title: "Choose your time",
    description: "2-30 minute summaries tailored to your schedule.",
    color: "from-violet-400 to-purple-500",
  },
  {
    icon: Podcast,
    title: "Subscribe to shows",
    description: "Get automatic Blipps whenever new episodes drop.",
    color: "from-orange-400 to-rose-500",
  },
];

export function Landing() {
  return (
    <div className="min-h-screen bg-[#06060e] text-white overflow-hidden">
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=DM+Sans:wght@400;500&display=swap');

        .font-sora { font-family: 'Sora', sans-serif; }
        .font-dm { font-family: 'DM Sans', sans-serif; }

        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -40px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        @keyframes float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-40px, 30px) scale(0.95); }
          66% { transform: translate(25px, -25px) scale(1.05); }
        }
        @keyframes float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, 30px) scale(1.1); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(168, 85, 247, 0.4), 0 0 60px rgba(168, 85, 247, 0.1); }
          50% { box-shadow: 0 0 30px rgba(168, 85, 247, 0.6), 0 0 80px rgba(168, 85, 247, 0.2); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up {
          animation: fade-up 0.8s ease-out both;
        }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-400 { animation-delay: 0.4s; }
        .delay-500 { animation-delay: 0.5s; }
        .delay-600 { animation-delay: 0.6s; }
        .delay-700 { animation-delay: 0.7s; }
      `}</style>

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
        {/* Gradient orbs */}
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-30 blur-[120px]"
          style={{
            background: "radial-gradient(circle, #a855f7 0%, transparent 70%)",
            top: "10%",
            left: "15%",
            animation: "float-1 12s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full opacity-25 blur-[100px]"
          style={{
            background: "radial-gradient(circle, #f97316 0%, transparent 70%)",
            top: "30%",
            right: "10%",
            animation: "float-2 15s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-[350px] h-[350px] rounded-full opacity-20 blur-[90px]"
          style={{
            background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)",
            bottom: "15%",
            left: "30%",
            animation: "float-3 10s ease-in-out infinite",
          }}
        />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative z-10 max-w-3xl">
          {/* Logo */}
          <div className="animate-fade-up font-sora text-sm font-600 tracking-[0.3em] uppercase text-violet-400 mb-8">
            Blipp
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-up delay-100 font-sora text-5xl sm:text-6xl md:text-7xl font-800 leading-[1.05] tracking-tight"
            style={{
              background: "linear-gradient(135deg, #fff 0%, #e2e8f0 40%, #a855f7 70%, #f97316 100%)",
              backgroundSize: "200% 200%",
              animation: "gradient-shift 6s ease infinite",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            All your podcasts
            <br />
            in a blipp.
          </h1>

          {/* Subhead */}
          <p className="animate-fade-up delay-200 font-sora text-lg sm:text-xl text-zinc-400 mt-6 font-600">
            Too many podcasts. Not enough time.
          </p>

          {/* Body */}
          <p className="animate-fade-up delay-300 font-dm text-base sm:text-lg text-zinc-500 mt-5 max-w-xl mx-auto leading-relaxed">
            Blipp turns full podcast episodes into short, voice-narrated summaries
            called <span className="text-white font-500">Blipps</span>. Choose how much time you have
            — <span className="text-violet-400">2, 5, 10, 15, or 30 minutes</span> — and
            Blipp delivers the most important insights from any episode.
          </p>

          {/* CTA */}
          <div className="animate-fade-up delay-400 mt-10">
            <SignInButton>
              <button
                className="font-sora relative px-8 py-4 rounded-xl text-base font-700 text-white transition-all duration-300 hover:scale-105 active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #a855f7, #f97316)",
                  backgroundSize: "200% 200%",
                  animation: "gradient-shift 4s ease infinite, pulse-glow 3s ease-in-out infinite",
                }}
              >
                Start Blipping
              </button>
            </SignInButton>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 animate-fade-up delay-700">
          <div className="w-5 h-8 border-2 border-zinc-700 rounded-full flex justify-center pt-1.5">
            <div className="w-1 h-2 bg-zinc-500 rounded-full animate-bounce" />
          </div>
        </div>
      </section>

      {/* ─── VALUE PROP ─── */}
      <section className="relative py-24 px-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <p className="font-dm text-lg sm:text-xl text-zinc-400 leading-relaxed animate-fade-up">
            Follow your favorite podcasts and automatically get a{" "}
            <span className="text-white font-500">fresh Blipp for every new release</span>.
            Stay informed, discover new ideas, and keep up with more shows
            without spending hours listening.
          </p>
          <p className="font-dm text-lg sm:text-xl text-zinc-500 leading-relaxed animate-fade-up delay-100">
            Whether you're commuting, walking the dog, or grabbing coffee,
            Blipp lets you{" "}
            <span className="text-transparent bg-clip-text font-500" style={{ backgroundImage: "linear-gradient(135deg, #a855f7, #f97316)" }}>
              hear the signal without the noise
            </span>.
          </p>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="relative py-24 px-6">
        {/* Background accent */}
        <div
          className="absolute w-[600px] h-[300px] rounded-full opacity-10 blur-[100px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ background: "linear-gradient(135deg, #7c3aed, #f97316)" }}
        />

        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="animate-fade-up group relative rounded-2xl p-6 border border-white/[0.06] backdrop-blur-sm transition-all duration-300 hover:border-white/[0.12] hover:-translate-y-1"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
                  animationDelay: `${i * 0.15}s`,
                }}
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg`}>
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-sora text-lg font-700 mb-2">{f.title}</h3>
                <p className="font-dm text-sm text-zinc-500 leading-relaxed">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── BOTTOM CTA ─── */}
      <section className="relative py-32 px-6 text-center">
        {/* Gradient accent */}
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-15 blur-[120px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ background: "radial-gradient(circle, #a855f7 0%, transparent 70%)" }}
        />

        <div className="relative z-10">
          <h2 className="animate-fade-up font-sora text-3xl sm:text-4xl md:text-5xl font-800 mb-4">
            Start listening smarter.
          </h2>
          <p
            className="animate-fade-up delay-100 font-sora text-xl sm:text-2xl font-700 text-transparent bg-clip-text mb-10"
            style={{ backgroundImage: "linear-gradient(135deg, #a855f7, #f97316)" }}
          >
            Don't binge. Just Blipp.
          </p>
          <div className="animate-fade-up delay-200">
            <SignInButton>
              <button
                className="font-sora relative px-10 py-4 rounded-xl text-lg font-700 text-white transition-all duration-300 hover:scale-105 active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #a855f7, #f97316)",
                  backgroundSize: "200% 200%",
                  animation: "gradient-shift 4s ease infinite, pulse-glow 3s ease-in-out infinite",
                }}
              >
                Start Blipping
              </button>
            </SignInButton>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/[0.05] py-8 px-6 text-center">
        <p className="font-dm text-sm text-zinc-600">
          &copy; 2026 Blipp. All your podcasts, distilled.
        </p>
      </footer>
    </div>
  );
}
