import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppClerkProvider } from "./providers/clerk-provider";
import { ThemeProvider } from "./contexts/theme-context";
import { StorageProvider } from "./contexts/storage-context";
import App from "./App";
import { Toaster } from "./components/toaster";
import { registerSW } from "virtual:pwa-register";
import { Capacitor } from "@capacitor/core";
import "./index.css";

if (Capacitor.isNativePlatform()) {
  // Service workers interfere with Capacitor's scheme handler in WKWebView —
  // stale-while-revalidate caches can hang dynamic /assets/* imports. Unregister
  // any SW that was installed by a previous web build of this origin.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister().catch(() => undefined));
    }).catch(() => undefined);
    caches?.keys?.().then((keys) => {
      keys.forEach((k) => caches.delete(k).catch(() => undefined));
    }).catch(() => undefined);
  }
} else {
  registerSW();
}

class DebugErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: `${err.message}\n${err.stack}` };
  }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ color: "red", padding: 20, whiteSpace: "pre-wrap" }}>
          {this.state.error}
        </pre>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DebugErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AppClerkProvider>
            <StorageProvider>
              <App />
            </StorageProvider>
            <Toaster />
          </AppClerkProvider>
        </BrowserRouter>
      </ThemeProvider>
    </DebugErrorBoundary>
  </StrictMode>
);
