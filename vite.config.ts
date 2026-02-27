import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      "@": "/src",
      // Shim: @clerk/react@5.54.0 imports loadClerkUiScript which is missing
      // from @clerk/shared@3.47.1. This alias provides the missing export.
      "@clerk/shared/loadClerkJsScript": path.resolve(
        __dirname,
        "src/shims/clerk-load-script.ts"
      ),
    },
  },
});
