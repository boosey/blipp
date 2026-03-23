import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.blipp.app",
  appName: "Blipp",
  webDir: "dist/client",
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
