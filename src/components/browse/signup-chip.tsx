import { SignUpButton } from "@clerk/clerk-react";

/**
 * Inline "Sign up to ___" CTA used to replace authenticated-only actions
 * (favorite, vote, subscribe) on /browse/* pages.
 *
 * Per the Phase 2 finalization: every removed action becomes a converting
 * CTA in its place — never invisible.
 */
export function SignupChip({
  label,
  size = "sm",
  redirectTo,
}: {
  label: string;
  size?: "xs" | "sm" | "md";
  /** Path the user lands on after signup. Defaults to current page. */
  redirectTo?: string;
}) {
  const cls =
    size === "xs"
      ? "text-[11px] px-2 py-0.5"
      : size === "md"
      ? "text-sm px-3 py-1.5"
      : "text-xs px-2.5 py-1";

  const target = redirectTo ?? (typeof window !== "undefined" ? window.location.pathname : "/home");

  return (
    <SignUpButton
      mode="modal"
      forceRedirectUrl={target}
      signInForceRedirectUrl={target}
    >
      <button
        className={`${cls} rounded-full bg-white/10 hover:bg-white/20 text-white/90 transition-colors whitespace-nowrap`}
        type="button"
      >
        {label}
      </button>
    </SignUpButton>
  );
}
