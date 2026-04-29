/**
 * SSR entry point for the build-time prerender script.
 *
 * Imported by `scripts/prerender.mjs` after `vite build --ssr` produces
 * the server bundle. The script calls `render(url)` for each marketing
 * route and writes the result to `dist/<route>/index.html`.
 *
 * Wrapping is intentionally minimal — only `ClerkProvider` (so Clerk's
 * `<SignedIn>`/`<SignedOut>`/`SignInButton`/`useUser` resolve to their
 * unauth/loading state on the server) and `StaticRouter` (for routing).
 * Skipping `ThemeProvider`/`StorageProvider` because:
 *   - ThemeProvider uses `localStorage`/`window.matchMedia` at module
 *     init time and would crash in Node.
 *   - StorageProvider needs a real auth session and IndexedDB — neither
 *     of which exists in SSR.
 *   - Marketing routes don't call `useTheme()` or `useStorage()`.
 */
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error(
    "VITE_CLERK_PUBLISHABLE_KEY is required for SSR; ensure .env / .env.production is loaded before vite build --ssr."
  );
}

export function render(url: string): string {
  return renderToString(
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </ClerkProvider>
  );
}
