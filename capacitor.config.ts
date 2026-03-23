import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.blipp.app",
  appName: "Blipp",
  webDir: "dist/client",
  ios: {
    contentInset: "automatic",
    // Use https scheme so Clerk can set cookies in the WebView
    scheme: "https",
  },
  server: {
    hostname: "localhost",
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
