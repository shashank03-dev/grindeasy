import { defineConfig } from "vitest/config";

// The server package has its own vitest (run `npm test` inside server/).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
