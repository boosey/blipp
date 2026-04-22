import { Link } from "react-router-dom";
import { Mail } from "lucide-react";

export function Contact() {
  return (
    <div className="min-h-screen bg-[#06060e] text-white px-6 py-20">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          &larr; Back to home
        </Link>

        <h1 className="font-sora text-4xl font-800 mt-8 mb-6">Contact Us</h1>

        <p className="font-dm text-lg text-zinc-400 leading-relaxed mb-8">
          Have a question, feedback, or just want to say hi? We'd love to hear
          from you.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/support"
            className="inline-flex items-center gap-3 rounded-xl bg-violet-500 px-6 py-4 font-sora text-base font-600 text-white transition-colors hover:bg-violet-400"
          >
            Send a message
          </Link>
          <a
            href="mailto:support@podblipp.com"
            className="inline-flex items-center gap-3 rounded-xl border border-white/[0.08] px-6 py-4 font-sora text-base font-600 text-white transition-all duration-200 hover:border-violet-500/40 hover:bg-white/[0.03]"
          >
            <Mail className="w-5 h-5 text-violet-400" />
            support@podblipp.com
          </a>
        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.06] text-center">
          <Link
            to="/about"
            className="font-sora text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            About Blipp &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
