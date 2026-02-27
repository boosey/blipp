import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "worker/**/__tests__/**/*.test.ts",
      "src/__tests__/**/*.test.tsx",
      "src/__tests__/**/*.test.ts",
    ],
    setupFiles: ["./tests/helpers/setup.ts"],
  },
});
