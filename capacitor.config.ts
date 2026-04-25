import type { CapacitorConfig } from "@capacitor/cli";

// BLIPP_TARGET_ENV=staging routes the iOS build at staging.podblipp.com; anything
// else (including unset) defaults to production (podblipp.com).
const hostname =
  process.env.BLIPP_TARGET_ENV === "staging" ? "staging.podblipp.com" : "podblipp.com";

const config: CapacitorConfig = {
  appId: "com.blipp.app",
  appName: "Blipp",
  webDir: "dist/client",
  plugins: {
    CapacitorHttp: {
      // Enable native HTTP — needed for cookie handling with Clerk proxy
      enabled: true,
    },
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
    },
  },
  ios: {
    contentInset: "automatic",
    scheme: "https",
    // Force-enable WKWebView inspection for non-prod builds so Safari Web
    // Inspector can attach regardless of Xcode build configuration. The
    // Capacitor default only enables it under #if DEBUG, which is brittle
    // when iPhone has a stale Release build cached.
    webContentsDebuggingEnabled: process.env.BLIPP_TARGET_ENV !== "production",
  },
  server: {
    hostname,
    // Allow mixed content (capacitor:// loading from https API)
    allowNavigation: [
      "podblipp.com",
      "*.podblipp.com",
      "clerk.podblipp.com",
      "*.clerk.accounts.dev",
      "*.workers.dev",
    ],
  },
};

export default config;
