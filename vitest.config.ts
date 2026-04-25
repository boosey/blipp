import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "worker/**/__tests__/**/*.test.ts",
      "src/__tests__/**/*.test.tsx",
      "src/__tests__/**/*.test.ts",
      "src/lib/__tests__/**/*.test.ts",
      "src/hooks/__tests__/**/*.test.ts",
      "src/hooks/__tests__/**/*.test.tsx",
    ],
    setupFiles: ["./tests/helpers/setup.ts"],
  },
});
