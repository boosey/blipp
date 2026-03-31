import { Link } from "react-router-dom";

export function About() {
  return (
    <div className="min-h-screen bg-[#06060e] text-white px-6 py-20">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          &larr; Back to home
        </Link>

        <h1 className="font-sora text-4xl font-800 mt-8 mb-6">About Blipp</h1>

        <div className="space-y-5 font-dm text-zinc-400 leading-relaxed text-lg">
          <p>
            Blipp turns full podcast episodes into short, voice-narrated
            summaries — so you can keep up with more shows in less time.
          </p>
          <p>
            Whether it's a two-minute recap or a thirty-minute deep dive, Blipp
            distills the signal from the noise and delivers it in a format that
            fits your schedule.
          </p>
          <p>
            Subscribe to your favorite podcasts and get a fresh{" "}
            <span className="text-white font-500">Blipp</span> automatically
            whenever a new episode drops. No more falling behind.
          </p>
          <p>
            When a summary sparks your curiosity, tap{" "}
            <span className="text-white font-500">Listen to Original</span> to
            jump straight to the full episode on its source platform. Blipp
            isn't a replacement for podcasts — it's the fastest way to find the
            ones worth your time.
          </p>

          <h2 className="font-sora text-2xl font-700 text-white pt-4">
            Our mission
          </h2>
          <p>
            We believe everyone deserves access to great ideas — even when time
            is short. Blipp exists to make podcast knowledge accessible,
            digestible, and effortless.
          </p>

          <h2 className="font-sora text-2xl font-700 text-white pt-4">
            How it works
          </h2>
          <ol className="list-decimal list-inside space-y-2">
            <li>Search or subscribe to any podcast.</li>
            <li>Choose your preferred summary length.</li>
            <li>Listen to a voice-narrated Blipp of each episode.</li>
            <li>Tap "Listen to Original" to hear the full episode when you want more.</li>
          </ol>
        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.06] text-center">
          <Link
            to="/contact"
            className="font-sora text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            Get in touch &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
  
}

