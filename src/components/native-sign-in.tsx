import { useSignIn, useSignUp, useClerk } from "@clerk/clerk-react";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Native sign-in component for Capacitor.
 * Implements custom OAuth flow using in-app browser
 * (ASWebAuthenticationSession on iOS) so the callback
 * returns to the app properly.
 */
export function NativeSignIn() {
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const { setActive } = useClerk();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track whether we initiated an OAuth flow
  const oauthInProgress = useRef(false);

  // Listen for app resume — only process if we started an OAuth flow
  useEffect(() => {
    const onResume = App.addListener("resume", async () => {
      if (!oauthInProgress.current || !signIn || !signUp) return;
      oauthInProgress.current = false;

      try {
        // Reload the sign-in to get the latest status after OAuth
        const si = await signIn.reload();
        console.log("OAUTH_RESUME: signIn status", si.status);

        if (si.status === "complete" && si.createdSessionId) {
          await setActive({ session: si.createdSessionId });
          navigate("/home", { replace: true });
          return;
        }

        // If the user is new, Clerk may need a sign-up transfer
        if (si.firstFactorVerification?.status === "transferable" && signUp) {
          const su = await signUp.create({ transfer: true });
          if (su.status === "complete" && su.createdSessionId) {
            await setActive({ session: su.createdSessionId });
            navigate("/home", { replace: true });
            return;
          }
        }

        setError("Sign-in was not completed. Please try again.");
      } catch (err: any) {
        console.error("OAuth resume error:", err);
        setError("Sign-in failed. Please try again.");
      } finally {
        setLoading(false);
      }
    });

    return () => {
      onResume.then((l) => l.remove());
    };
  }, [signIn, signUp, setActive, navigate]);

  const handleGoogleSignIn = async () => {
    if (!signIn) return;
    setLoading(true);
    setError(null);

    try {
      // Create a new OAuth sign-in attempt
      const result = await signIn.create({
        strategy: "oauth_google",
        redirectUrl: "https://blipp-staging.boosey-boudreaux.workers.dev/sso-callback",
      });

      const authUrl =
        result.firstFactorVerification?.externalVerificationRedirectURL;

      console.log("OAUTH_DEBUG: status", result.status);
      console.log("OAUTH_DEBUG: authUrl", authUrl?.toString());

      if (!authUrl) {
        throw new Error("No authorization URL returned");
      }

      // Mark that we started an OAuth flow
      oauthInProgress.current = true;

      // Open in-app browser
      await Browser.open({
        url: authUrl.toString(),
        presentationStyle: "popover",
      });
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      setError(err.errors?.[0]?.longMessage || err.message || "Failed to start sign-in");
      setLoading(false);
      oauthInProgress.current = false;
    }
  };

  if (!signInLoaded || !signUpLoaded) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#06060e]">
        <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 bg-[#06060e]">
      <h2 className="text-2xl font-bold text-white mb-4">Sign in to Blipp</h2>

      {error && (
        <p className="text-red-400 text-sm text-center mb-2">{error}</p>
      )}

      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="flex items-center gap-3 px-6 py-3 bg-white text-gray-800 rounded-lg font-medium hover:bg-gray-100 transition-colors w-full max-w-sm justify-center disabled:opacity-50"
      >
        {loading ? (
          <div className="animate-spin h-5 w-5 border-2 border-gray-400 border-t-transparent rounded-full" />
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        )}
        Continue with Google
      </button>
    </div>
  );
}
