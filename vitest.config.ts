import { defineConfig } from "vitest/config";
import { workspaceAliases } from "./aliases.ts";

export default defineConfig({
  resolve: {
    alias: workspaceAliases,
  },
  test: {
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "tools/e2e/**/*.test.ts",
    ],
    environment: "node",
    passWithNoTests: false,
  },
});
