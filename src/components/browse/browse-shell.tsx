import { Link } from "react-router-dom";
import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { ReactNode } from "react";

interface BrowseShellProps {
  children: ReactNode;
  /** Optional breadcrumb trail rendered above page content. */
  breadcrumbs?: { label: string; to?: string }[];
}

/**
 * Header + footer chrome for unauthenticated /browse/* pages.
 *
 * Deliberately separate from MobileLayout (which is auth-only) and from the
 * marketing landing page chrome. Browse exists to convert visitors into
 * signups, so primary CTAs are signup-shaped. All catalog interactions
 * (favorite, vote, subscribe) are replaced with "Sign up to ..." pivots
 * inside individual components — see browse-show-card and signup-chip.
 */
export function BrowseShell({ children, breadcrumbs }: BrowseShellProps) {
  return (
    <div className="min-h-screen bg-[#06060e] text-white flex flex-col">
      <header className="border-b border-white/10 sticky top-0 bg-[#06060e]/95 backdrop-blur z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Blipp
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              to="/browse"
              className="text-white/70 hover:text-white transition-colors hidden sm:inline"
            >
              Browse
            </Link>
            <Link
              to="/how-it-works"
              className="text-white/70 hover:text-white transition-colors hidden sm:inline"
            >
              How it works
            </Link>
            <Link
              to="/pricing"
              className="text-white/70 hover:text-white transition-colors hidden sm:inline"
            >
              Pricing
            </Link>
            <SignInButton mode="modal">
              <button className="text-white/80 hover:text-white text-sm transition-colors">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="bg-white text-black text-sm font-medium px-3 py-1.5 rounded-full hover:bg-white/90 transition-colors">
                Sign up
              </button>
            </SignUpButton>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="text-xs text-white/50 mb-4 flex flex-wrap gap-1">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-white">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-white/70">{crumb.label}</span>
                )}
                {i < breadcrumbs.length - 1 && <span className="text-white/30">/</span>}
              </span>
            ))}
          </nav>
        )}
        {children}
      </main>

      <footer className="border-t border-white/10 py-6 text-xs text-white/40">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap gap-4 justify-between">
          <div>© Blipp</div>
          <div className="flex gap-4">
            <Link to="/about" className="hover:text-white">About</Link>
            <Link to="/tos" className="hover:text-white">Terms</Link>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/pulse" className="hover:text-white">Pulse</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
