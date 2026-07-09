import { planBadge } from "./plan";
import { tierForXp, xpFromTotals } from "./tiers";
import type { Plan } from "./types";

/** One user's aggregate as read from storage. */
export interface BoardRow {
  discordId: string;
  username: string;
  /** Discord avatar hash, or null. */
  avatar: string | null;
  plan: Plan;
  activeMs: number;
  combos: number;
}

/** One ranked leaderboard entry, ready for rendering. */
export interface BoardEntry extends BoardRow {
  rank: number;
  xp: number;
  hours: number;
  tierName: string;
  tierGlyph: string;
  planBadge: string;
  avatarUrl: string | null;
}

/**
 * Rank users on the single global board. Scoring is the exact same formula the
 * agent uses (hours + combos × 0.25) — one board for everyone, with the plan
 * shown as a badge for context, never as a weighting.
 */
export function rankBoard(rows: BoardRow[], limit = 100): BoardEntry[] {
  return rows
    .map((row) => {
      const xp = xpFromTotals(row.activeMs, row.combos);
      const tier = tierForXp(xp);
      return {
        ...row,
        rank: 0,
        xp,
        hours: row.activeMs / 3_600_000,
        tierName: tier.name,
        tierGlyph: tier.glyph,
        planBadge: planBadge(row.plan),
        avatarUrl: row.avatar
          ? `https://cdn.discordapp.com/avatars/${row.discordId}/${row.avatar}.png?size=64`
          : null,
      };
    })
    .sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username))
    .slice(0, limit)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}
