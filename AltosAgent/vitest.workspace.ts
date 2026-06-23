import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*/vitest.config.ts",
  "apps/*/vitest.config.ts",
  {
    test: {
      name: "root",
      environment: "node",
      include: ["root/**/*.test.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
      },
    },
  },
]);
