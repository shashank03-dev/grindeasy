import { describe, expect, it } from "vitest";
import { freshStats } from "../src/store.js";
import { dayKey, Tracker } from "../src/tracker.js";
import type { ToolActivity } from "../src/types.js";

function act(id: string, active: boolean): ToolActivity {
  return { id, name: id, active, ageMs: active ? 0 : null };
}

describe("Tracker", () => {
  it("credits active tools by elapsed time", () => {
    const t = new Tracker({ maxElapsedMs: 10_000 });
    const s = freshStats(0);
    t.recordTick(s, [act("claude-code", true)], 1000, 5000);
    expect(s.activeMsByTool["claude-code"]).toBe(5000);
    expect(s.daily[dayKey(1000)]?.activeMs).toBe(5000);
    expect(s.lastActive).not.toBeNull();
  });

  it("caps a single tick at maxElapsedMs (sleep protection)", () => {
    const t = new Tracker({ maxElapsedMs: 10_000 });
    const s = freshStats(0);
    t.recordTick(s, [act("a", true)], 1000, 6 * 3_600_000);
    expect(s.activeMsByTool["a"]).toBe(10_000);
  });

  it("does nothing when no tool is active", () => {
    const t = new Tracker();
    const s = freshStats(0);
    t.recordTick(s, [act("a", false), act("b", false)], 1000, 5000);
    expect(s.activeMsByTool).toEqual({});
    expect(s.lastActive).toBeNull();
  });

  it("counts one combo per bucket for 2+ active tools", () => {
    const t = new Tracker({ comboBucketMs: 1000, maxElapsedMs: 10_000 });
    const s = freshStats(0);
    // two ticks in the same 1000ms bucket -> a single combo
    t.recordTick(s, [act("a", true), act("b", true)], 100, 100);
    t.recordTick(s, [act("a", true), act("b", true)], 900, 800);
    expect(s.combos).toBe(1);
    // next bucket -> another combo
    t.recordTick(s, [act("a", true), act("b", true)], 1500, 600);
    expect(s.combos).toBe(2);
  });

  it("does not count a combo for a single active tool", () => {
    const t = new Tracker({ comboBucketMs: 1000 });
    const s = freshStats(0);
    t.recordTick(s, [act("a", true), act("b", false)], 100, 100);
    expect(s.combos).toBe(0);
  });
});
