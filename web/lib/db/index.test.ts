import { describe, expect, it } from "vitest";

describe("connection retry", () => {
  // The retry budget is a production tradeoff, not an implementation detail: it
  // has to be long enough to ride out a Neon cold start (1-5s) but short enough
  // that a real outage fails the request instead of pinning a serverless
  // function open while every queued visitor stacks up behind it.
  it("retries the connection, then gives up rather than hanging", async () => {
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:1/nope";
    const { getDb } = await import("./index");
    const { users } = await import("./schema");

    const started = Date.now();
    await expect(getDb().select().from(users).limit(1)).rejects.toThrow();
    const elapsed = Date.now() - started;

    // A single attempt against a refused port returns almost instantly, so the
    // backoff (250 + 500 + 750ms across 4 attempts) is what this lower bound
    // actually proves: the connection really is being retried. The upper bound
    // guards the ceiling.
    expect(elapsed).toBeGreaterThan(1_400);
    expect(elapsed).toBeLessThan(15_000);
  }, 30_000);
});
