import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.blipp.app",
  appName: "Blipp",
  webDir: "dist/client",
  ios: {
    contentInset: "automatic",
    scheme: "Blipp",
  },
  server: {
    // Allow mixed content (capacitor:// loading from https API)
    allowNavigation: ["podblipp.com", "*.podblipp.com", "*.clerk.accounts.dev"],
  },
};

export default config;
