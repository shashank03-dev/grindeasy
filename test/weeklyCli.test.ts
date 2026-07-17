import { describe, expect, it } from "vitest";
import { computeWeekly } from "../src/snapshot.js";
import { freshStats } from "../src/store.js";
import { dayKey } from "../src/tracker.js";
import { renderWeeklyPanel, sparkline } from "../src/weeklyCli.js";
import type { Stats } from "../src/types.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;

function statsFromDays(now: number, days: Record<number, number>): Stats {
  const s = freshStats(0);
  for (const [offset, hours] of Object.entries(days)) {
    const key = dayKey(now - Number(offset) * DAY);
    s.daily[key] = { activeMs: hours * HOUR, combos: 0, byTool: { "claude-code": hours * HOUR } };
  }
  return s;
}

describe("sparkline", () => {
  it("scales values across the block ramp, peaking at the max", () => {
    const line = sparkline([0, 1, 2, 4]);
    expect(line).toHaveLength(4);
    expect(line.at(-1)).toBe("█"); // the max maps to the tallest block
  });

  it("is flat at the lowest block when everything is zero", () => {
    expect(sparkline([0, 0, 0])).toBe("▁▁▁");
  });
});

describe("renderWeeklyPanel", () => {
  const now = Date.parse("2026-07-16T12:00:00Z");

  it("renders the headline hours and consistency", () => {
    const w = computeWeekly(statsFromDays(now, { 0: 2, 1: 1 }), now);
    const out = renderWeeklyPanel(w);
    expect(out).toContain("3.0h");
    expect(out).toContain("of 7 days active");
    expect(out).toContain("Claude Code");
  });

  it("shows a goal line only when a goal is set", () => {
    const s = statsFromDays(now, { 0: 5 });
    expect(renderWeeklyPanel(computeWeekly(s, now, 0))).not.toContain("goal");
    expect(renderWeeklyPanel(computeWeekly(s, now, 10))).toContain("goal");
  });

  it("shows an empty-state message with no activity", () => {
    const out = renderWeeklyPanel(computeWeekly(freshStats(0), now));
    expect(out).toContain("No activity in the last 7 days");
  });

  it("says first week instead of comparing against a week that never happened", () => {
    const out = renderWeeklyPanel(computeWeekly(statsFromDays(now, { 0: 3 }), now));
    expect(out).toContain("first week tracked");
    expect(out).not.toContain("vs last week");
  });

  it("compares against last week once there is prior history", () => {
    const out = renderWeeklyPanel(computeWeekly(statsFromDays(now, { 0: 3, 9: 1 }), now));
    expect(out).toContain("vs last week");
    expect(out).not.toContain("first week tracked");
  });
});
