import { SignIn } from "@clerk/clerk-react";

/**
 * Native sign-in component for Capacitor.
 * Uses Clerk's embedded SignIn component which handles OAuth internally
 * within the WebView, avoiding the in-app browser cookie issue entirely.
 * The OAuth popup/redirect stays within Clerk's domain where cookies work.
 */
export function NativeSignIn() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-[#06060e]">
      <SignIn
        routing="hash"
        fallbackRedirectUrl="/home"
        signUpFallbackRedirectUrl="/home"
      />
    </div>
  );
}
