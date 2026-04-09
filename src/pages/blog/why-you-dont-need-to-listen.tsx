import { Link } from "react-router-dom";
import { SignInButton } from "@clerk/clerk-react";

export function BlogWhyYouDontNeedToListen() {
  return (
    <div className="min-h-screen bg-[#06060e] text-white px-6 py-20">
      <article className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          &larr; Back to home
        </Link>

        <div className="mt-8 mb-10">
          <span className="font-dm text-xs text-violet-400 uppercase tracking-widest">
            Productivity
          </span>
          <h1 className="font-sora text-3xl md:text-4xl font-800 mt-2 mb-4 leading-tight">
            Why You Don't Need to Listen to Every Podcast Episode
          </h1>
          <p className="font-dm text-zinc-500 text-sm">
            Published April 2026 &middot; 5 min read
          </p>
        </div>

        <div className="prose-blipp font-dm text-zinc-400 leading-relaxed text-lg space-y-6">
          <p>
            You subscribe to 15 podcasts. Each one drops a new episode every
            week. That's roughly <strong className="text-white">20 hours of audio</strong>{" "}
            hitting your feed — every single week. If you work a full-time job,
            exercise, sleep, and have any semblance of a social life, there is
            simply no way to keep up.
          </p>
          <p>
            And yet, the guilt lingers. You see that notification badge climbing:
            12 unplayed episodes, then 30, then 100. You tell yourself you'll
            catch up on the weekend, but the weekend never has enough hours
            either.
          </p>

          <h2 className="font-sora text-xl font-700 text-white pt-4">
            The podcast overload problem
          </h2>
          <p>
            Podcast listening has exploded. There are now over 4 million active
            podcasts, and the average listener subscribes to 7+ shows. But
            unlike articles you can skim, podcasts are a linear, time-locked
            medium. You can speed them up to 1.5x or 2x, but you still have to
            sit through every tangent, every ad read, every 10-minute intro.
          </p>
          <p>
            The result? Most people develop "podcast debt" — a growing backlog
            of episodes they intend to listen to but never will. Sound familiar?
          </p>

          <h2 className="font-sora text-xl font-700 text-white pt-4">
            Not every episode deserves 90 minutes of your time
          </h2>
          <p>
            Here's the liberating truth: most podcast episodes have 10–15
            minutes of genuinely valuable content buried inside 60–90 minutes
            of conversation. There's context-setting, banter, tangential stories,
            and recap. Valuable for entertainment, sure — but if you're
            listening to learn, you're spending a lot of time on filler.
          </p>
          <p>
            The solution isn't to stop listening to podcasts. It's to be
            <strong className="text-white"> strategic about which episodes get your full attention</strong>{" "}
            and which ones you just need the highlights from.
          </p>

          <h2 className="font-sora text-xl font-700 text-white pt-4">
            A better approach: triage your podcast feed
          </h2>
          <p>
            Think of it like email triage. Not every email needs a thoughtful
            reply — some just need a quick scan. Podcasts are the same:
          </p>
          <ul className="list-disc list-inside space-y-2 text-zinc-400">
            <li>
              <strong className="text-zinc-300">Must-listen episodes:</strong>{" "}
              Your favorite host interviews someone you admire. Listen in full.
            </li>
            <li>
              <strong className="text-zinc-300">Scan-worthy episodes:</strong>{" "}
              Interesting topic, but you don't need every detail. A summary
              will do.
            </li>
            <li>
              <strong className="text-zinc-300">Skip-worthy episodes:</strong>{" "}
              Repeat guests, topics you've heard before. Let them go.
            </li>
          </ul>
          <p>
            The problem is that today's podcast apps don't help you triage.
            They show you a list of episodes and a play button. That's it.
          </p>

          <h2 className="font-sora text-xl font-700 text-white pt-4">
            How AI podcast summaries change the game
          </h2>
          <p>
            This is exactly why we built{" "}
            <Link to="/" className="text-violet-400 hover:text-violet-300">
              Blipp
            </Link>
            . Blipp turns full podcast episodes into short, voice-narrated
            summaries — from 2 minutes to 30 minutes — so you can quickly
            understand what an episode covers before deciding whether to invest
            the full listen.
          </p>
          <p>
            Subscribe to any podcast, and Blipp automatically generates a
            summary whenever a new episode drops. You listen to the Blipp in a
            couple of minutes, and if it sounds interesting, you tap through to
            the original episode. If not, you move on — guilt-free.
          </p>

          <h2 className="font-sora text-xl font-700 text-white pt-4">
            Reclaim your time
          </h2>
          <p>
            You don't need to listen to every podcast episode. You just need to
            know what's in them. AI podcast summaries let you stay informed
            across all your subscriptions without the 20-hour weekly time
            commitment.
          </p>
          <p>
            Stop feeling guilty about your podcast backlog.{" "}
            <strong className="text-white">Start being strategic about it.</strong>
          </p>
        </div>

        {/* CTA */}
        <div className="mt-12 p-8 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center">
          <p className="font-sora text-lg font-600 text-white mb-2">
            Try Blipp free
          </p>
          <p className="font-dm text-sm text-zinc-400 mb-4">
            Get AI podcast summaries for any show. No credit card required.
          </p>
          <SignInButton mode="modal">
            <button className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 text-white font-sora font-600 text-sm hover:opacity-90 transition-opacity cursor-pointer">
              Get started free
            </button>
          </SignInButton>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/blog/best-way-to-keep-up-with-podcasts"
            className="font-dm text-sm text-violet-400 hover:text-violet-300"
          >
            Next: The Best Way to Keep Up With 10+ Podcasts &rarr;
          </Link>
        </div>
      </article>
    </div>
  );
}
