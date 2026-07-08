import { describe, expect, it } from "vitest";
import { buildActivity } from "../src/presence.js";
import { buildSnapshot, computeStreak } from "../src/snapshot.js";
import { freshStats } from "../src/store.js";
import { dayKey } from "../src/tracker.js";
import { computeTier } from "../src/tiers.js";

const DAY = 86_400_000;

describe("computeStreak", () => {
  it("counts consecutive active days ending today", () => {
    const now = Date.parse("2026-07-08T12:00:00Z");
    const daily: Record<string, { activeMs: number; combos: number }> = {};
    for (let i = 0; i < 3; i++) {
      daily[dayKey(now - i * DAY)] = { activeMs: 100, combos: 0 };
    }
    expect(computeStreak(daily, now)).toBe(3);
  });

  it("holds the streak when today is empty but yesterday was active", () => {
    const now = Date.parse("2026-07-08T12:00:00Z");
    const daily: Record<string, { activeMs: number; combos: number }> = {
      [dayKey(now - DAY)]: { activeMs: 100, combos: 0 },
      [dayKey(now - 2 * DAY)]: { activeMs: 100, combos: 0 },
    };
    expect(computeStreak(daily, now)).toBe(2);
  });

  it("is zero with no activity", () => {
    expect(computeStreak({}, Date.now())).toBe(0);
  });
});

describe("buildSnapshot", () => {
  it("reflects tier, tools and plan", () => {
    const s = freshStats(0);
    s.activeMsByTool = { "claude-code": 40 * 3_600_000 };
    const snap = buildSnapshot(s, "max", ["Claude Code"], "https://x", 0);
    expect(snap.tierName).toBe("Gold");
    expect(snap.planBadge).toBe("MAX");
    expect(snap.perTool[0]?.id).toBe("claude-code");
    expect(snap.activeNow).toEqual(["Claude Code"]);
  });
});

describe("buildActivity", () => {
  const opts = { clientId: "1", donateUrl: "https://x", showIdlePresence: true };

  it("builds an active card with a session timer", () => {
    const tier = computeTier(freshStats(0));
    const a = buildActivity(
      { activeToolNames: ["Claude Code", "Codex"], tier, plan: "pro", sessionStartMs: 123 },
      opts,
    );
    expect(a?.details).toContain("Claude Code + Codex");
    expect(a?.startTimestamp).toBe(123);
  });

  it("returns null when idle and idle presence is disabled", () => {
    const tier = computeTier(freshStats(0));
    const a = buildActivity(
      { activeToolNames: [], tier, plan: "pro", sessionStartMs: null },
      { ...opts, showIdlePresence: false },
    );
    expect(a).toBeNull();
  });
});
