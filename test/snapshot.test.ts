import { describe, expect, it } from "vitest";
import { buildActivity } from "../src/presence.js";
import { buildSnapshot, computeAchievements, computeStreak } from "../src/snapshot.js";
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

describe("computeAchievements", () => {
  it("earns hour and combo achievements from stats", () => {
    const s = freshStats(0);
    s.activeMsByTool = { "claude-code": 12 * 3_600_000 };
    s.combos = 3;
    const byId = Object.fromEntries(computeAchievements(s, 0).map((a) => [a.id, a.earned]));
    expect(byId["first-hour"]).toBe(true);
    expect(byId["ten-hours"]).toBe(true);
    expect(byId["fifty-hours"]).toBe(false);
    expect(byId["first-combo"]).toBe(true);
    expect(byId["combo-25"]).toBe(false);
  });

  it("earns polyglot only with an hour in three tools", () => {
    const s = freshStats(0);
    s.activeMsByTool = { a: 3_600_000, b: 3_600_000, c: 3_599_000 };
    expect(computeAchievements(s, 0).find((a) => a.id === "polyglot")?.earned).toBe(false);
    s.activeMsByTool.c = 3_600_000;
    expect(computeAchievements(s, 0).find((a) => a.id === "polyglot")?.earned).toBe(true);
  });

  it("is included in snapshots along with sync state", () => {
    const s = freshStats(0);
    const snap = buildSnapshot(s, "pro", [], "https://x", 0, {
      status: "ok",
      lastSyncAt: "2026-07-09T00:00:00.000Z",
      lastError: null,
    });
    expect(snap.achievements.length).toBeGreaterThan(0);
    expect(snap.sync?.status).toBe("ok");
    // Disabled sync is reported as null (nothing to show).
    const off = buildSnapshot(s, "pro", [], "https://x", 0, {
      status: "disabled",
      lastSyncAt: null,
      lastError: null,
    });
    expect(off.sync).toBeNull();
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
