import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { AppClerkProvider } from "./providers/clerk-provider";
import { ThemeProvider } from "./contexts/theme-context";
import App from "./App";
import { Toaster } from "./components/toaster";
import "./index.css";

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

if ("serviceWorker" in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DebugErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AppClerkProvider>
            <App />
            <Toaster />
          </AppClerkProvider>
        </BrowserRouter>
      </ThemeProvider>
    </DebugErrorBoundary>
  </StrictMode>
);
