import { defineConfig } from "vitest/config";

// Standalone test config — pure unit tests for the money/logic helpers. Node
// environment, no app plugins (the vite app config is rolldown-based and not
// needed here). Tests import by relative path, so no alias resolution is needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
