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
    // TEMPORARY: unconditionally enable inspection so we can debug iOS
    // audio playback (issue #8) on a prod-pointing build. The npm
    // build:ios:production script sets BLIPP_TARGET_ENV=production, which
    // would otherwise strip this flag. REVERT before merging — production
    // builds shipped to App Store users should not be inspectable.
    webContentsDebuggingEnabled: true,
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
