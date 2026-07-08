import type { Stats, TierResult } from "./types.js";

/** How much an XP a single combo window is worth, in "hours equivalent". */
export const COMBO_XP_HOURS = 0.25;

/** Tier ladder, ascending. Threshold is XP (hours-equivalent) required to enter. */
export const TIERS: ReadonlyArray<{ name: string; glyph: string; xp: number }> = [
  { name: "Bronze", glyph: "▲", xp: 0 },
  { name: "Silver", glyph: "■", xp: 10 },
  { name: "Gold", glyph: "★", xp: 40 },
  { name: "Platinum", glyph: "◆", xp: 100 },
  { name: "Diamond", glyph: "❖", xp: 250 },
];

/** Sum active ms across all tools. */
export function totalActiveMs(stats: Stats): number {
  return Object.values(stats.activeMsByTool).reduce((a, b) => a + b, 0);
}

/**
 * XP is total active hours plus a bonus for combo windows. Combos reward
 * using multiple tools together (skill, not spend), independent of plan.
 */
export function computeXp(stats: Stats): number {
  const hours = totalActiveMs(stats) / 3_600_000;
  return hours + stats.combos * COMBO_XP_HOURS;
}

/** Resolve the current tier and the XP needed for the next one. */
export function computeTier(stats: Stats): TierResult {
  const xp = computeXp(stats);
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
