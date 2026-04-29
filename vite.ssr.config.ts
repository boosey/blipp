/**
 * Vite config used only for the SSR build invoked by scripts/prerender.mjs.
 *
 * The main `vite.config.ts` includes the Cloudflare plugin (which rewrites
 * the build pipeline to emit a worker bundle + client/ subdir) and the
 * Tailwind+PWA plugins. None of those are appropriate for an SSR-only
 * build — we want a single Node-runnable ESM file that exports the
 * React-rendering `render(url)` function.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    ssr: "src/entry-server.tsx",
    outDir: ".ssr-build",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: "esm",
        entryFileNames: "entry-server.js",
        // Single file output. The SSR bundle imports server-irrelevant
        // chunks (admin pages, etc.) via React.lazy, but those import()
        // calls are never executed at SSR time, so we can inline.
        inlineDynamicImports: true,
      },
    },
  },
  ssr: {
    // Bundle everything — many of our deps (Capacitor, RevenueCat, Clerk
    // internals) ship ESM that Node can't resolve as externals because of
    // missing extensions or conditional exports. Inlining them all keeps
    // Node happy at runtime.
    noExternal: true,
  },
});
