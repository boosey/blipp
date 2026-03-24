import { useSignIn, useSignUp, useClerk } from "@clerk/clerk-react";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Native sign-in component for Capacitor.
 * Uses custom URL scheme (blipp://) to receive OAuth callback.
 * Flow: App → in-app browser → Google → Clerk callback → server redirect → blipp://auth-callback → App
 */
export function NativeSignIn() {
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const { setActive, client } = useClerk();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oauthInProgress = useRef(false);
  const signInIdRef = useRef<string | null>(null);

  // Listen for deep link callback (blipp://auth-callback)
  useEffect(() => {
    const appUrlListener = App.addListener("appUrlOpen", async (event) => {
      console.log("OAUTH_DEEPLINK:", event.url);

      if (!event.url.startsWith("blipp://auth-callback")) return;
      if (!oauthInProgress.current) return;
      oauthInProgress.current = false;

      // Close the in-app browser
      try { await Browser.close(); } catch (e) { /* may already be closed */ }

      try {
        // The OAuth completed in the in-app browser. Clerk's callback
        // set the rotating token on the server side. Now reload the
        // signIn from the WebView which has the __client cookie.
        if (signIn) {
          const si = await signIn.reload();
          console.log("OAUTH_DEEPLINK: signIn status:", si.status);
          console.log("OAUTH_DEEPLINK: verification:", si.firstFactorVerification?.status);

          if (si.status === "complete" && si.createdSessionId) {
            await setActive({ session: si.createdSessionId });
            navigate("/home", { replace: true });
            return;
          }

          // Handle transferable (new user needs signUp)
          if (si.firstFactorVerification?.status === "transferable" && signUp) {
            const su = await signUp.create({ transfer: true } as any);
            if (su.status === "complete" && su.createdSessionId) {
              await setActive({ session: su.createdSessionId });
              navigate("/home", { replace: true });
              return;
            }
          }

          // If verification is still unverified, the OAuth may not have completed
          if (si.firstFactorVerification?.status === "unverified") {
            setError("Sign-in was cancelled. Please try again.");
          } else {
            setError(`Sign-in incomplete (status: ${si.status}). Please try again.`);
          }
        } else {
          setError("Sign-in not initialized. Please try again.");
        }
      } catch (err: any) {
        console.error("OAuth callback error:", err);
        setError(err.errors?.[0]?.longMessage || err.message || "Sign-in failed");
      } finally {
        setLoading(false);
      }
    });

    // Handle browser close — this fires when user dismisses the in-app browser.
    // Since the deep link may not fire (Clerk shows error instead of redirecting
    // to our sso-callback), we try to complete the sign-in here.
    const browserFinished = Browser.addListener("browserFinished", async () => {
      console.log("OAUTH: browser closed, oauthInProgress:", oauthInProgress.current);
      if (!oauthInProgress.current) return;
      oauthInProgress.current = false;

      if (!signIn) {
        setLoading(false);
        return;
      }

      try {
        // Reload the signIn from the WebView context which has the __client cookie.
        // Even though the in-app browser showed an error, Clerk may have already
        // processed the OAuth callback server-side.
        const si = await signIn.reload();
        console.log("OAUTH_RESUME: signIn status:", si.status);
        console.log("OAUTH_RESUME: verification:", si.firstFactorVerification?.status);

        if (si.status === "complete" && si.createdSessionId) {
          await setActive({ session: si.createdSessionId });
          navigate("/home", { replace: true });
          return;
        }

        // Handle transferable (new user needs signUp)
        if (si.firstFactorVerification?.status === "transferable" && signUp) {
          console.log("OAUTH_RESUME: creating signUp from transfer");
          const su = await signUp.create({ transfer: true } as any);
          if (su.status === "complete" && su.createdSessionId) {
            await setActive({ session: su.createdSessionId });
            navigate("/home", { replace: true });
            return;
          }
        }

        if (si.firstFactorVerification?.status === "unverified") {
          setError("Sign-in was cancelled. Please try again.");
        } else {
          setError(`Sign-in incomplete (${si.status}). Please try again.`);
        }
      } catch (err: any) {
        console.error("OAuth resume error:", err);
        setError(err.errors?.[0]?.longMessage || "Sign-in failed. Please try again.");
      } finally {
        setLoading(false);
      }
    });

    return () => {
      appUrlListener.then((l) => l.remove());
      browserFinished.then((l) => l.remove());
    };
  }, [signIn, signUp, setActive, client, navigate]);

  const handleGoogleSignIn = async () => {
    if (!signIn) return;
    setLoading(true);
    setError(null);

    try {
      // Create a new OAuth sign-in attempt
      // redirectUrl tells Clerk where to redirect after the OAuth callback
      // Our server at this URL will redirect to blipp://auth-callback
      const result = await signIn.create({
        strategy: "oauth_google",
        redirectUrl: "https://blipp-staging.boosey-boudreaux.workers.dev/api/sso-callback",
      });

      signInIdRef.current = result.id ?? null;

      const authUrl =
        result.firstFactorVerification?.externalVerificationRedirectURL;

      console.log("OAUTH_DEBUG: status", result.status);
      console.log("OAUTH_DEBUG: signInId", result.id);
      console.log("OAUTH_DEBUG: authUrl", authUrl?.toString());

      if (!authUrl) {
        throw new Error("No authorization URL returned");
      }

      // The in-app browser doesn't share cookies with the WebView.
      // We need to pass the __client token so our server can include it
      // when completing the OAuth callback with Clerk's FAPI.
      const clientCookie = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("__client="));
      const clientToken = clientCookie?.split("=")[1] || "";

      console.log("OAUTH_DEBUG: has __client cookie:", !!clientToken);
      console.log("OAUTH_DEBUG: signInId:", result.id);

      oauthInProgress.current = true;

      // Store the client token so we can use it after callback
      if (clientToken) {
        localStorage.setItem("__clerk_client_token", clientToken);
      }
      if (result.id) {
        localStorage.setItem("__clerk_sign_in_id", result.id);
      }

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
