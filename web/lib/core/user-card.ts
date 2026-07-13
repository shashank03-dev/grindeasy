import type { BoardRow } from "./leaderboard";
import { rankOf } from "./leaderboard";
import { planBadge } from "./plan";
import { isOnline, type PresenceInput } from "./presence";
import { TIERS, tierForXp, xpFromTotals } from "./tiers";
import type { Plan } from "./types";

/** Everything the signed-in personal card renders — derived, never stored. */
export interface UserCardData {
  username: string;
  avatarUrl: string | null;
  tierName: string;
  tierGlyph: string;
  planBadge: string;
  /** Standing out of the whole field, or null if the user has no activity yet. */
  rank: number | null;
  totalPlayers: number | null;
  hours: number;
  combos: number;
  xp: number;
  /** Progress through the current tier band, 0–100. */
  nextTierProgressPct: number;
  /** XP still needed for the next tier, or null at the top tier. */
  xpToNext: number | null;
  perTool: { id: string; hours: number }[];
  isOnline: boolean;
  /** Tool ids working right now, only while online. */
  activeTools: string[];
}

export interface UserCardInput {
  username: string;
  avatar: string | null;
  discordId: string;
  plan: Plan;
  combos: number;
  toolTotalsMs: Record<string, number>;
  boardRows: BoardRow[];
  presence: PresenceInput & { activeNow: string[] | null };
  now?: number;
}

/** Lower bound of the current tier band: the largest threshold below the next. */
function currentBandStart(nextAtXp: number): number {
  let start = 0;
  for (const t of TIERS) {
    if (t.xp < nextAtXp) start = t.xp;
    else break;
  }
  return start;
}

export function buildUserCard(input: UserCardInput): UserCardData {
  const { username, avatar, discordId, plan, combos, toolTotalsMs, boardRows, presence } = input;
  const now = input.now ?? Date.now();

  const activeMs = Object.values(toolTotalsMs).reduce((sum, ms) => sum + ms, 0);
  const xp = xpFromTotals(activeMs, combos);
  const tier = tierForXp(xp);

  let nextTierProgressPct = 100;
  if (tier.nextAtXp !== null) {
    const bandStart = currentBandStart(tier.nextAtXp);
    const span = tier.nextAtXp - bandStart;
    nextTierProgressPct = span > 0 ? Math.min(100, ((xp - bandStart) / span) * 100) : 0;
  }

  const perTool = Object.entries(toolTotalsMs)
    .map(([id, ms]) => ({ id, hours: ms / 3_600_000 }))
    .sort((a, b) => b.hours - a.hours);

  const standing = rankOf(boardRows, discordId);
  const online = isOnline(presence, now);

  return {
    username,
    avatarUrl: avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=64`
      : null,
    tierName: tier.name,
    tierGlyph: tier.glyph,
    planBadge: planBadge(plan),
    rank: standing?.rank ?? null,
    totalPlayers: standing?.totalPlayers ?? null,
    hours: activeMs / 3_600_000,
    combos,
    xp,
    nextTierProgressPct,
    xpToNext: tier.nextAtXp !== null ? tier.nextAtXp - xp : null,
    perTool,
    isOnline: online,
    activeTools: online ? (presence.activeNow ?? []) : [],
  };
}
