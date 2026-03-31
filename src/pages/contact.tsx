import { useState } from "react";
import { Link } from "react-router-dom";
import { Send, CheckCircle } from "lucide-react";

export function Contact() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("general");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message, category }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="min-h-screen bg-[#06060e] text-white px-6 py-20">
        <div className="max-w-2xl mx-auto text-center">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h1 className="font-sora text-3xl font-800 mb-3">Thanks for your feedback!</h1>
          <p className="font-dm text-zinc-400 text-lg mb-8">
            We'll review your message and get back to you if needed.
          </p>
          <Link
            to="/"
            className="font-sora text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    );
  }

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

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block font-sora text-sm font-500 text-zinc-300 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-dm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-violet-500/40"
            />
          </div>

          <div>
            <label htmlFor="category" className="block font-sora text-sm font-500 text-zinc-300 mb-1.5">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-dm text-white outline-none transition-colors focus:border-violet-500/40"
            >
              <option value="general">General</option>
              <option value="bug">Bug Report</option>
              <option value="feature">Feature Request</option>
            </select>
          </div>

          <div>
            <label htmlFor="message" className="block font-sora text-sm font-500 text-zinc-300 mb-1.5">
              Message
            </label>
            <textarea
              id="message"
              required
              minLength={5}
              maxLength={5000}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what's on your mind..."
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-dm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-violet-500/40 resize-y"
            />
          </div>

          {status === "error" && (
            <p className="text-red-400 font-dm text-sm">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === "sending"}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 font-sora text-sm font-600 text-white transition-all duration-200 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {status === "sending" ? "Sending..." : "Send Feedback"}
          </button>
        </form>

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
