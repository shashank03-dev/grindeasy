import { planBadge } from "../../src/plan.js";
import { tierForXp, xpFromTotals } from "../../src/tiers.js";
import type { Plan } from "../../src/types.js";

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
 * Score every row and sort best-first. Ranks are not assigned here: a rank is
 * only meaningful against the *whole* field, so callers that truncate must
 * truncate after ranking, never before.
 */
function scoreAndSort(rows: BoardRow[]): Omit<BoardEntry, "rank">[] {
  return rows
    .map((row) => {
      const xp = xpFromTotals(row.activeMs, row.combos);
      const tier = tierForXp(xp);
      return {
        ...row,
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
    .sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username));
}

/**
 * Rank users on the single global board. Scoring is the exact same formula the
 * agent uses (hours + combos × 0.25) — one board for everyone, with the plan
 * shown as a badge for context, never as a weighting.
 */
export function rankBoard(rows: BoardRow[], limit = 100): BoardEntry[] {
  return scoreAndSort(rows)
    .map((entry, i) => ({ ...entry, rank: i + 1 }))
    .slice(0, limit);
}

/** One user's standing in the full field. */
export interface Standing {
  rank: number;
  totalPlayers: number;
}

/**
 * Where one user sits on the board. Computed against every row, not the top
 * slice rankBoard renders — otherwise player #340 would have no rank at all,
 * which is exactly who most needs to see one on their card.
 */
export function rankOf(rows: BoardRow[], discordId: string): Standing | null {
  const all = scoreAndSort(rows);
  const index = all.findIndex((entry) => entry.discordId === discordId);
  if (index === -1) return null;
  return { rank: index + 1, totalPlayers: all.length };
}
