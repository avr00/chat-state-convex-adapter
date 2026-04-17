import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "edge-runtime",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts", "convex/**/*.ts"],
      exclude: ["src/**/*.test.ts", "convex/**/*.test.ts", "convex/_generated/**"],
    },
  },
});
