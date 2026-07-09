import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMBO_XP_HOURS, tierForXp, xpFromTotals } from "./tiers";

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../test/fixtures/scoring-vectors.json"), "utf8"),
) as {
  comboXpHours: number;
  vectors: Array<{
    activeMs: number;
    combos: number;
    xp: number;
    tier: string;
    glyph: string;
    nextAtXp: number | null;
  }>;
};

describe("scoring parity with the agent", () => {
  it("agrees on the combo XP weight", () => {
    expect(COMBO_XP_HOURS).toBe(golden.comboXpHours);
  });

  it.each(golden.vectors)(
    "scores $activeMs ms + $combos combos as $xp XP ($tier)",
    ({ activeMs, combos, xp, tier, glyph, nextAtXp }) => {
      const computed = xpFromTotals(activeMs, combos);
      expect(computed).toBeCloseTo(xp, 10);

      const result = tierForXp(computed);
      expect(result.name).toBe(tier);
      expect(result.glyph).toBe(glyph);
      expect(result.nextAtXp).toBe(nextAtXp);
    },
  );
});
