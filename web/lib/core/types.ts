/** The subscription/billing plan we surface as a badge. */
export type Plan = "api" | "pro" | "max" | "unknown";

/** A computed tier for display. */
export interface TierResult {
  /** Tier name, e.g. "Platinum". */
  name: string;
  /** Unicode glyph shown next to the name, e.g. "◆". */
  glyph: string;
  /** Total XP (hours + combo bonus) used to derive the tier. */
  xp: number;
  /** XP at which the next tier unlocks, or null if maxed. */
  nextAtXp: number | null;
}
