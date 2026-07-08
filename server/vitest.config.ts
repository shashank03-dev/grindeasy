import { defineConfig } from "vitest/config";

// Also stops vitest from walking up and loading the repo-root config.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
