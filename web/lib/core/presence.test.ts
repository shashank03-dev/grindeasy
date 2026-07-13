import { describe, expect, it } from "vitest";
import { isOnline, ONLINE_WINDOW_MS } from "./presence";

const NOW = 1_700_000_000_000;
const ago = (ms: number) => new Date(NOW - ms);

describe("isOnline", () => {
  it("is online when the explicit active flag is fresh", () => {
    expect(isOnline({ lastActiveAt: ago(30_000), lastSeenAt: null }, NOW)).toBe(true);
  });

  it("is offline when the active flag has gone stale (user stopped coding)", () => {
    expect(isOnline({ lastActiveAt: ago(ONLINE_WINDOW_MS + 1), lastSeenAt: null }, NOW)).toBe(false);
  });

  it("trusts the active flag over a fresher heartbeat", () => {
    // Idle new agent: heartbeats keep coming, but lastActiveAt is stale → offline.
    expect(isOnline({ lastActiveAt: ago(5 * 60_000), lastSeenAt: ago(10_000) }, NOW)).toBe(false);
  });

  it("falls back to the heartbeat for old agents that never send active", () => {
    expect(isOnline({ lastActiveAt: null, lastSeenAt: ago(30_000) }, NOW)).toBe(true);
    expect(isOnline({ lastActiveAt: null, lastSeenAt: ago(3 * 60_000) }, NOW)).toBe(false);
  });

  it("is offline with no signal at all", () => {
    expect(isOnline({ lastActiveAt: null, lastSeenAt: null }, NOW)).toBe(false);
  });
});
