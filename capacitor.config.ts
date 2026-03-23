import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.blipp.app",
  appName: "Blipp",
  webDir: "dist/client",
  ios: {
    contentInset: "automatic",
  },
  server: {
    // Use https scheme + production hostname so Origin header is https://podblipp.com
    iosScheme: "https",
    hostname: "podblipp.com",
    // Allow mixed content (capacitor:// loading from https API)
    allowNavigation: [
      "podblipp.com",
      "*.podblipp.com",
      "clerk.podblipp.com",
      "*.clerk.accounts.dev",
    ],
  },
};

export default config;
