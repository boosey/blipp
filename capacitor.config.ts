import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.blipp.app",
  appName: "Blipp",
  webDir: "dist/client",
  ios: {
    contentInset: "automatic",
    // Use https scheme so Clerk accepts the Origin header
    scheme: "https",
  },
  server: {
    // Match the production domain so Clerk Origin validation passes
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
