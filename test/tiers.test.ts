import { describe, expect, it } from "vitest";
import { freshStats } from "../src/store.js";
import { computeTier, computeXp, COMBO_XP_HOURS, totalActiveMs } from "../src/tiers.js";

const H = 3_600_000;

describe("tiers", () => {
  it("starts at Bronze with no activity", () => {
    const t = computeTier(freshStats(0));
    expect(t.name).toBe("Bronze");
    expect(t.nextAtXp).toBe(10);
  });

  it("sums active ms across tools as tool-hours", () => {
    const s = freshStats(0);
    s.activeMsByTool = { a: 4 * H, b: 7 * H };
    expect(totalActiveMs(s)).toBe(11 * H);
    expect(computeXp(s)).toBeCloseTo(11, 6);
  });

  it("promotes to Silver at 10 XP and Diamond at 250", () => {
    const silver = freshStats(0);
    silver.activeMsByTool = { a: 10 * H };
    expect(computeTier(silver).name).toBe("Silver");

    const diamond = freshStats(0);
    diamond.activeMsByTool = { a: 250 * H };
    expect(computeTier(diamond).name).toBe("Diamond");
    expect(computeTier(diamond).nextAtXp).toBeNull();
  });

  it("counts combos toward XP", () => {
    const s = freshStats(0);
    s.activeMsByTool = { a: 9 * H };
    s.combos = 4; // 4 * 0.25 = 1 XP -> total 10 -> Silver
    expect(COMBO_XP_HOURS).toBe(0.25);
    expect(computeTier(s).name).toBe("Silver");
  });
});
