/**
 * Native sign-in component for Capacitor iOS/Android.
 *
 * Uses native sign-in plugins (Google, Apple) to get an ID token,
 * sends it to our server which verifies it and creates a Clerk
 * sign-in ticket, then uses the ticket to authenticate via the
 * Clerk JS SDK in the WebView.
 *
 * No browser popup. No cookie issues. No origin problems.
 */
import { useSignIn, useClerk } from "@clerk/clerk-react";
import { registerPlugin } from "@capacitor/core";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

// Register the native plugin directly — avoids importing @capgo/capacitor-social-login
// which Vite can't bundle (it's a native-only module)
const SocialLoginPlugin: any = registerPlugin("SocialLogin");

const API_BASE = "https://blipp-staging.boosey-boudreaux.workers.dev";

export function NativeSignIn() {
  const { signIn, isLoaded } = useSignIn();
  const { setActive } = useClerk();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null); // provider name or null
  const [error, setError] = useState<string | null>(null);
  const socialLoginRef = useRef<any>(null);

  // Initialize the native social login plugin
  useEffect(() => {
    socialLoginRef.current = SocialLoginPlugin;
    SocialLoginPlugin.initialize({
      google: {
        iOSClientId: "774074678441-o78mvmtptb57ofinl1m49f8ttj1po850.apps.googleusercontent.com",
        iOSServerClientId: "774074678441-msdfel83984fpirbqg73nm2fv440a26t.apps.googleusercontent.com",
      },
      apple: {
        clientId: "com.blipp.app",
      },
    })
      .then(() => {
        console.log("SocialLogin initialized successfully");
      })
      .catch((err: any) => {
        console.error("SocialLogin init error:", JSON.stringify(err), err?.message, err?.code);
      });
  }, []);

  const handleNativeSignIn = async (provider: "google" | "apple") => {
    if (!signIn || !isLoaded) return;
    setLoading(provider);
    setError(null);

    try {
      // Step 1: Native sign-in — OS-level dialog, no browser
      const SocialLogin = socialLoginRef.current;
      if (!SocialLogin) {
        throw new Error("Social login plugin not initialized");
      }

      let idToken: string;

      if (provider === "google") {
        const result = await SocialLogin.login({
          provider: "google",
          options: {
            scopes: ["email", "profile"],
          },
        });
        console.log("NATIVE_AUTH: Google sign-in result:", JSON.stringify(result).substring(0, 200));
        idToken = result.result?.idToken || "";
      } else if (provider === "apple") {
        const result = await SocialLogin.login({
          provider: "apple",
          options: {
            scopes: ["email", "name"],
          },
        });
        console.log("NATIVE_AUTH: Apple sign-in result:", JSON.stringify(result).substring(0, 200));
        idToken = result.result?.idToken || "";
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      if (!idToken) {
        throw new Error("No ID token received from sign-in");
      }

      console.log("NATIVE_AUTH: got ID token, sending to server");

      // Step 2: Send token to our server for verification + ticket creation
      const resp = await fetch(`${API_BASE}/api/auth/native`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, idToken }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({})) as any;
        throw new Error(data.error || `Server error: ${resp.status}`);
      }

      const { ticket } = (await resp.json()) as { ticket: string; userId: string };
      console.log("NATIVE_AUTH: got ticket from server");

      // Step 3: Use the ticket to sign in via Clerk JS SDK (in WebView)
      const result = await signIn.create({
        strategy: "ticket",
        ticket,
      });

      console.log("NATIVE_AUTH: ticket sign-in status:", result.status);

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        navigate("/home", { replace: true });
      } else {
        throw new Error(`Unexpected sign-in status: ${result.status}`);
      }
    } catch (err: any) {
      console.error("NATIVE_AUTH error:", JSON.stringify(err), err?.message, err?.code);
      // Don't show error if user cancelled
      if (err.message?.includes("cancel") || err.message?.includes("Cancel")) {
        setLoading(null);
        return;
      }
      setError(err.errors?.[0]?.longMessage || err.message || "Sign-in failed");
    } finally {
      setLoading(null);
    }
  };

  if (!isLoaded) {
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

      {/* Google Sign-In */}
      <button
        onClick={() => handleNativeSignIn("google")}
        disabled={!!loading}
        className="flex items-center gap-3 px-6 py-3 bg-white text-gray-800 rounded-lg font-medium hover:bg-gray-100 transition-colors w-full max-w-sm justify-center disabled:opacity-50"
      >
        {loading === "google" ? (
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

      {/* Apple Sign-In — iOS only */}
      <button
        onClick={() => handleNativeSignIn("apple")}
        disabled={!!loading}
        className="flex items-center gap-3 px-6 py-3 bg-black text-white border border-gray-700 rounded-lg font-medium hover:bg-gray-900 transition-colors w-full max-w-sm justify-center disabled:opacity-50"
      >
        {loading === "apple" ? (
          <div className="animate-spin h-5 w-5 border-2 border-gray-400 border-t-transparent rounded-full" />
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
        )}
        Continue with Apple
      </button>
    </div>
  );
}
