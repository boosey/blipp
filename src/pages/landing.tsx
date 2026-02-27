import { Link } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton } from "@clerk/react";

/** Public landing page with hero section and auth-aware CTA. */
export function Landing() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center">
      <h1 className="text-6xl font-bold mb-4">Blipp</h1>
      <p className="text-xl text-zinc-400 mb-8">
        Your podcasts, distilled to fit your time.
      </p>
      <SignedOut>
        <SignInButton>
          <button className="px-6 py-3 bg-zinc-50 text-zinc-950 font-semibold rounded-lg hover:bg-zinc-200 transition-colors">
            Get Started
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <Link
          to="/dashboard"
          className="px-6 py-3 bg-zinc-50 text-zinc-950 font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
        >
          Go to Dashboard
        </Link>
      </SignedIn>
    </div>
  );
}
