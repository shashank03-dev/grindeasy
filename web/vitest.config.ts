import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
    // Each DB test spins up a fresh in-process PGlite and runs the real
    // migrations in beforeEach; that cold start can pass 10s under load, so the
    // default hook timeout flakes. The work itself is fast — only startup is slow.
    hookTimeout: 30_000,
  },
});
