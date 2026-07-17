import { describe, expect, it } from "vitest";
import { buildActivity } from "../src/presence.js";
import {
  buildSnapshot,
  computeAchievements,
  computeMonthly,
  computeRecap,
  computeRecords,
  computeStreak,
  computeWeekly,
  isoWeekKey,
} from "../src/snapshot.js";
import { freshStats } from "../src/store.js";
import { dayKey } from "../src/tracker.js";
import { computeTier } from "../src/tiers.js";
import type { Stats } from "../src/types.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Build a Stats whose daily rollup has `hours` (and optional byTool) per offset-day. */
function statsFromDays(
  now: number,
  days: Record<number, { hours: number; byTool?: Record<string, number>; combos?: number }>,
): Stats {
  const s = freshStats(0);
  for (const [offsetStr, v] of Object.entries(days)) {
    const key = dayKey(now - Number(offsetStr) * DAY);
    s.daily[key] = {
      activeMs: v.hours * HOUR,
      combos: v.combos ?? 0,
      byTool: v.byTool ?? { "claude-code": v.hours * HOUR },
    };
  }
  return s;
}

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

describe("computeWeekly", () => {
  const now = Date.parse("2026-07-16T12:00:00Z");

  it("sums the last 7 days, with delta vs the prior week", () => {
    const s = statsFromDays(now, {
      0: { hours: 2, byTool: { "claude-code": 2 * HOUR } },
      1: { hours: 1, byTool: { codex: 1 * HOUR }, combos: 3 },
      3: { hours: 1, byTool: { "claude-code": 1 * HOUR } },
      9: { hours: 1 }, // prior window (days 8–14)
    });
    const w = computeWeekly(s, now);
    expect(w.activeHours).toBeCloseTo(4);
    expect(w.activeDays).toBe(3);
    expect(w.combos).toBe(3);
    expect(w.deltaHours).toBeCloseTo(3); // 4 this week − 1 prior week
    expect(w.perDay).toHaveLength(7);
    expect(w.bestDay?.hours).toBeCloseTo(2);
  });

  it("reports the most-used tool and its share of the week", () => {
    const s = statsFromDays(now, {
      0: { hours: 3, byTool: { "claude-code": 3 * HOUR } },
      1: { hours: 1, byTool: { codex: 1 * HOUR } },
    });
    const w = computeWeekly(s, now);
    expect(w.mostUsedTool?.id).toBe("claude-code");
    expect(w.mostUsedTool?.sharePct).toBeCloseTo(75); // 3h of 4h
  });

  it("exposes a goal percentage only when a goal is set", () => {
    const s = statsFromDays(now, { 0: { hours: 5 } });
    expect(computeWeekly(s, now, 0).goalPct).toBeNull();
    expect(computeWeekly(s, now, 10).goalPct).toBeCloseTo(50);
  });

  it("is empty and delta-zero with no history", () => {
    const w = computeWeekly(freshStats(0), now);
    expect(w.activeHours).toBe(0);
    expect(w.mostUsedTool).toBeNull();
    expect(w.bestDay).toBeNull();
    expect(w.deltaHours).toBe(0);
  });

  it("flags a first week when nothing was tracked before the window", () => {
    // Started 3 days ago: there is no prior week, so the delta is meaningless.
    const w = computeWeekly(statsFromDays(now, { 0: { hours: 2 }, 2: { hours: 1 } }), now);
    expect(w.isFirstWeek).toBe(true);
  });

  it("is not a first week once any activity precedes the window", () => {
    const w = computeWeekly(statsFromDays(now, { 0: { hours: 2 }, 9: { hours: 1 } }), now);
    expect(w.isFirstWeek).toBe(false);
  });

  it("still compares against an idle prior week when older history exists", () => {
    // Tracked 3 weeks ago, took the prior week off: "▲ 2h vs last week" is real.
    const w = computeWeekly(statsFromDays(now, { 0: { hours: 2 }, 20: { hours: 5 } }), now);
    expect(w.isFirstWeek).toBe(false);
    expect(w.deltaHours).toBeCloseTo(2); // 2 this week − 0 last week
  });
});

describe("computeMonthly", () => {
  const now = Date.parse("2026-07-16T12:00:00Z");

  it("returns 4 weeks oldest → newest, this week last", () => {
    const s = statsFromDays(now, {
      0: { hours: 2 }, // this week
      8: { hours: 3 }, // last week
    });
    const m = computeMonthly(s, now);
    expect(m).toHaveLength(4);
    expect(m[3]?.label).toBe("This week");
    expect(m[3]?.hours).toBeCloseTo(2);
    expect(m[2]?.label).toBe("Last week");
    expect(m[2]?.hours).toBeCloseTo(3);
  });
});

describe("computeRecords", () => {
  const now = Date.parse("2026-07-16T12:00:00Z");

  it("finds the best rolling week and the longest streak", () => {
    // A dense 5-day block plus an isolated earlier day.
    const s = statsFromDays(now, {
      1: { hours: 4 },
      2: { hours: 4 },
      3: { hours: 4 },
      4: { hours: 4 },
      5: { hours: 4 },
      20: { hours: 2 }, // isolated day, breaks the streak
    });
    const r = computeRecords(s, now);
    expect(r.bestWeekHours).toBeCloseTo(20); // the 5×4h block in one 7-day window
    expect(r.longestStreak).toBe(5);
    expect(r.bestWeekEnd).not.toBeNull();
  });

  it("is all-zero with no history", () => {
    expect(computeRecords(freshStats(0), now)).toEqual({
      bestWeekHours: 0,
      bestWeekEnd: null,
      longestStreak: 0,
    });
  });
});

describe("computeRecap", () => {
  const now = Date.parse("2026-07-16T12:00:00Z");

  it("summarizes the prior week when there was activity", () => {
    // Fill the last 14 days so the previous ISO week certainly has activity.
    const days: Record<number, { hours: number }> = {};
    for (let i = 0; i < 14; i++) days[i] = { hours: 1 };
    const recap = computeRecap(statsFromDays(now, days), now);
    expect(recap.currentWeek).toBe(isoWeekKey(now));
    expect(recap.summary).not.toBeNull();
    expect(recap.summary?.activeHours).toBeGreaterThan(0);
  });

  it("has a null summary when the prior week was empty", () => {
    expect(computeRecap(freshStats(0), now).summary).toBeNull();
  });
});

describe("isoWeekKey", () => {
  it("formats as YYYY-Www and advances a week 7 days later", () => {
    const now = Date.parse("2026-07-16T12:00:00Z");
    expect(isoWeekKey(now)).toMatch(/^\d{4}-W\d{2}$/);
    expect(isoWeekKey(now)).not.toBe(isoWeekKey(now + 7 * DAY));
    expect(isoWeekKey(now)).toBe(isoWeekKey(now + 2 * DAY)); // same week, +2 days
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
