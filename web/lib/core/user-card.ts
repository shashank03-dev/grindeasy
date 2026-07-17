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
  /** Per-day active hours Mon→Sun, present only on the weekly card. */
  histogram?: { label: string; hours: number }[];
  /**
   * Whether the user has *ever* logged activity. On the weekly card this is
   * lifetime-based, so a paired user idle this week still sees the weekly view
   * (zeroed) rather than the pairing prompt. Undefined on the all-time card,
   * where the component falls back to its own has-activity check.
   */
  everPaired?: boolean;
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

interface Level {
  xp: number;
  tierName: string;
  tierGlyph: string;
  nextTierProgressPct: number;
  xpToNext: number | null;
}

/** Tier, XP, and next-tier progress from raw totals. Tier is identity, so the
 *  weekly card feeds this its *lifetime* totals while its stats go weekly. */
function levelFromTotals(activeMs: number, combos: number): Level {
  const xp = xpFromTotals(activeMs, combos);
  const tier = tierForXp(xp);

  let nextTierProgressPct = 100;
  if (tier.nextAtXp !== null) {
    const bandStart = currentBandStart(tier.nextAtXp);
    const span = tier.nextAtXp - bandStart;
    nextTierProgressPct = span > 0 ? Math.min(100, ((xp - bandStart) / span) * 100) : 0;
  }

  return {
    xp,
    tierName: tier.name,
    tierGlyph: tier.glyph,
    nextTierProgressPct,
    xpToNext: tier.nextAtXp !== null ? tier.nextAtXp - xp : null,
  };
}

const sumMs = (byTool: Record<string, number>): number =>
  Object.values(byTool).reduce((sum, ms) => sum + ms, 0);

const perToolHours = (byTool: Record<string, number>): { id: string; hours: number }[] =>
  Object.entries(byTool)
    .map(([id, ms]) => ({ id, hours: ms / 3_600_000 }))
    .sort((a, b) => b.hours - a.hours);

// Weekday initial from a "YYYY-MM-DD" key, in UTC (matches the week's clock).
const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
function dayLetter(dayKey: string): string {
  return WEEKDAY_LETTER[new Date(`${dayKey}T00:00:00Z`).getUTCDay()]!;
}

export function buildUserCard(input: UserCardInput): UserCardData {
  const { username, avatar, discordId, plan, combos, toolTotalsMs, boardRows, presence } = input;
  const now = input.now ?? Date.now();

  const activeMs = sumMs(toolTotalsMs);
  const level = levelFromTotals(activeMs, combos);
  const standing = rankOf(boardRows, discordId);
  const online = isOnline(presence, now);

  return {
    username,
    avatarUrl: avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=64`
      : null,
    tierName: level.tierName,
    tierGlyph: level.tierGlyph,
    planBadge: planBadge(plan),
    rank: standing?.rank ?? null,
    totalPlayers: standing?.totalPlayers ?? null,
    hours: activeMs / 3_600_000,
    combos,
    xp: level.xp,
    nextTierProgressPct: level.nextTierProgressPct,
    xpToNext: level.xpToNext,
    perTool: perToolHours(toolTotalsMs),
    isOnline: online,
    activeTools: online ? (presence.activeNow ?? []) : [],
  };
}

export interface WeeklyUserCardInput {
  username: string;
  avatar: string | null;
  discordId: string;
  plan: Plan;
  /** Lifetime totals — drive tier, level, and the XP-to-next bar (identity). */
  lifetimeToolTotalsMs: Record<string, number>;
  lifetimeCombos: number;
  /** This week's activity — drives Active, Combos, and the by-tool breakdown. */
  weeklyToolTotalsMs: Record<string, number>;
  weeklyCombos: number;
  /** This week's board, for the weekly rank. */
  weeklyBoardRows: BoardRow[];
  /** Active ms per day, Monday→Sunday, aligned to `weekDays`. */
  perDay: number[];
  /** The 7 day keys, Monday→Sunday, aligned to `perDay` — used for bar labels. */
  weekDays: string[];
  presence: PresenceInput & { activeNow: string[] | null };
  now?: number;
}

/**
 * The weekly variant of the card. Identity stays lifetime — tier, plan, and the
 * XP/next-tier bar — while the activity numbers (rank, Active, Combos, by-tool)
 * and the histogram are all this week's. "Ever paired" is judged from lifetime
 * totals so an idle-this-week user still gets the weekly view, zeroed.
 */
export function buildWeeklyUserCard(input: WeeklyUserCardInput): UserCardData {
  const now = input.now ?? Date.now();

  const lifetimeActiveMs = sumMs(input.lifetimeToolTotalsMs);
  const level = levelFromTotals(lifetimeActiveMs, input.lifetimeCombos);

  const weeklyActiveMs = sumMs(input.weeklyToolTotalsMs);
  const standing = rankOf(input.weeklyBoardRows, input.discordId);
  const online = isOnline(input.presence, now);

  return {
    username: input.username,
    avatarUrl: input.avatar
      ? `https://cdn.discordapp.com/avatars/${input.discordId}/${input.avatar}.png?size=64`
      : null,
    tierName: level.tierName,
    tierGlyph: level.tierGlyph,
    planBadge: planBadge(input.plan),
    rank: standing?.rank ?? null,
    totalPlayers: standing?.totalPlayers ?? null,
    hours: weeklyActiveMs / 3_600_000,
    combos: input.weeklyCombos,
    xp: level.xp,
    nextTierProgressPct: level.nextTierProgressPct,
    xpToNext: level.xpToNext,
    perTool: perToolHours(input.weeklyToolTotalsMs),
    isOnline: online,
    activeTools: online ? (input.presence.activeNow ?? []) : [],
    histogram: input.perDay.map((ms, i) => ({
      label: dayLetter(input.weekDays[i]!),
      hours: ms / 3_600_000,
    })),
    everPaired: lifetimeActiveMs > 0 || input.lifetimeCombos > 0,
  };
}
