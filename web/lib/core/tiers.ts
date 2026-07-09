import type { TierResult } from "./types";

// Scoring must agree exactly with the agent's src/tiers.ts. Both are pinned to
// the shared golden vectors in test/fixtures/scoring-vectors.json — change the
// ladder here and the agent's suite fails too, which is the point.

/** How much XP a single combo window is worth, in "hours equivalent". */
export const COMBO_XP_HOURS = 0.25;

/** Tier ladder, ascending. Threshold is XP (hours-equivalent) required to enter. */
export const TIERS: ReadonlyArray<{ name: string; glyph: string; xp: number }> = [
  { name: "Bronze", glyph: "▲", xp: 0 },
  { name: "Silver", glyph: "■", xp: 10 },
  { name: "Gold", glyph: "★", xp: 40 },
  { name: "Platinum", glyph: "◆", xp: 100 },
  { name: "Diamond", glyph: "❖", xp: 250 },
];

/**
 * XP from raw totals: active hours plus a bonus for combo windows. Combos
 * reward using multiple tools together (skill, not spend), independent of plan.
 */
export function xpFromTotals(activeMs: number, combos: number): number {
  return activeMs / 3_600_000 + combos * COMBO_XP_HOURS;
}

/** Resolve the tier for a given XP and the XP needed for the next one. */
export function tierForXp(xp: number): TierResult {
  let current = TIERS[0]!;
  let nextAtXp: number | null = null;
  for (let i = 0; i < TIERS.length; i++) {
    const tier = TIERS[i]!;
    if (xp >= tier.xp) {
      current = tier;
      nextAtXp = TIERS[i + 1]?.xp ?? null;
    } else {
      break;
    }
  }
  return { name: current.name, glyph: current.glyph, xp, nextAtXp };
}
