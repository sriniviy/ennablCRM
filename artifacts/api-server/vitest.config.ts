import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Analytics tests share one isolated Postgres schema, so run files serially.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
