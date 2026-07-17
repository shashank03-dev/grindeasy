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
 * Score and order the whole field. Scoring is the exact same formula the agent
 * uses (hours + combos × 0.25) — one board for everyone, with the plan shown as
 * a badge for context, never as a weighting.
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

/** The public board: the top `limit` players, ranked. */
export function rankBoard(rows: BoardRow[], limit = 100): BoardEntry[] {
  // Rank against the whole field, then truncate. Ranking after the slice would
  // be identical here but wrong the moment a caller wants rank 101+.
  return scoreAndSort(rows)
    .map((entry, i) => ({ ...entry, rank: i + 1 }))
    .slice(0, limit);
}

/** Where one player stands, out of everyone. */
export interface Standing {
  rank: number;
  totalPlayers: number;
  /** The player's tier, from the same clamped totals the rank is based on, so a
   *  consumer (e.g. the Discord card) can show rank and tier as one figure. */
  tierName: string;
  tierGlyph: string;
}

/**
 * One player's standing, ranked against the entire field rather than the
 * visible top 100 — most players are below the cut, and their card still has to
 * show a real number.
 */
export function rankOf(rows: BoardRow[], discordId: string): Standing | null {
  const all = scoreAndSort(rows);
  const index = all.findIndex((entry) => entry.discordId === discordId);
  if (index === -1) return null;
  const entry = all[index]!;
  return {
    rank: index + 1,
    totalPlayers: all.length,
    tierName: entry.tierName,
    tierGlyph: entry.tierGlyph,
  };
}
