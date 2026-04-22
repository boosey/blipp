import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { useUser } from "@clerk/clerk-react";
import { apiFetch } from "@/lib/api";

export function Support() {
  const { user } = useUser();
  const defaultEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const defaultName = user?.fullName ?? "";

  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 0 &&
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/support", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#06060e] text-white px-6 py-20">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          &larr; Back to home
        </Link>

        <h1 className="font-sora text-4xl font-800 mt-8 mb-4">Support</h1>

        <p className="font-dm text-lg text-zinc-400 leading-relaxed mb-8">
          Have a question, found a bug, or need help with your account? Send us
          a message below and we'll get back to you.
        </p>

        {submitted ? (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6">
            <h2 className="font-sora text-xl font-600 mb-2">
              Thanks — we got your message.
            </h2>
            <p className="font-dm text-zinc-400 mb-6">
              We'll reply to <span className="text-white">{email}</span> as soon
              as we can.
            </p>
            <Link
              to="/"
              className="font-sora text-sm text-violet-400 hover:text-violet-300 transition-colors"
            >
              Back to home &rarr;
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="support-name"
                className="block font-sora text-sm font-600 text-zinc-300 mb-2"
              >
                Name <span className="text-zinc-500 font-400">(optional)</span>
              </label>
              <input
                id="support-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 font-dm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-violet-500/40"
                placeholder="Your name"
              />
            </div>

            <div>
              <label
                htmlFor="support-email"
                className="block font-sora text-sm font-600 text-zinc-300 mb-2"
              >
                Email
              </label>
              <input
                id="support-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={320}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 font-dm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-violet-500/40"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="support-subject"
                className="block font-sora text-sm font-600 text-zinc-300 mb-2"
              >
                Subject
              </label>
              <input
                id="support-subject"
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 font-dm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-violet-500/40"
                placeholder="What can we help with?"
              />
            </div>

            <div>
              <label
                htmlFor="support-message"
                className="block font-sora text-sm font-600 text-zinc-300 mb-2"
              >
                Message
              </label>
              <textarea
                id="support-message"
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={5000}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 font-dm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-violet-500/40 resize-y"
                placeholder="Tell us what's going on…"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 font-dm text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
              <a
                href="mailto:support@podblipp.com"
                className="inline-flex items-center gap-2 font-sora text-sm text-zinc-400 hover:text-violet-300 transition-colors"
              >
                <Mail className="w-4 h-4" />
                Or email support@podblipp.com
              </a>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center justify-center rounded-xl bg-violet-500 px-6 py-3 font-sora text-base font-600 text-white transition-colors hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending…" : "Send message"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
