import type { CapacitorConfig } from "@capacitor/cli";

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
      google: {
        iOSClientId: "774074678441-o78mvmtptb57ofinl1m49f8ttj1po850.apps.googleusercontent.com",
      },
    },
  },
  ios: {
    contentInset: "automatic",
    scheme: "https",
  },
  server: {
    hostname: "podblipp.com",
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
