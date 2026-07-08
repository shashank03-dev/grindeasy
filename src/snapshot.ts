import { planBadge } from "./plan.js";
import type { SyncState } from "./sync.js";
import { computeTier, computeXp, TIERS, totalActiveMs } from "./tiers.js";
import { dayKey } from "./tracker.js";
import type { Plan, Stats } from "./types.js";

export interface ToolLine {
  id: string;
  hours: number;
}

export interface Achievement {
  id: string;
  label: string;
  detail: string;
  earned: boolean;
}

export interface Snapshot {
  tierName: string;
  tierGlyph: string;
  xp: number;
  nextAtXp: number | null;
  progressPct: number;
  totalHours: number;
  perTool: ToolLine[];
  combos: number;
  plan: Plan;
  planBadge: string;
  streakDays: number;
  activeNow: string[];
  achievements: Achievement[];
  /** Leaderboard sync state, or null when sync is not configured. */
  sync: SyncState | null;
  donateUrl: string;
  generatedAt: string;
}

/** Derived on the fly from stats — nothing extra is persisted. */
export function computeAchievements(stats: Stats, now = Date.now()): Achievement[] {
  const totalHours = totalActiveMs(stats) / 3_600_000;
  const streak = computeStreak(stats.daily, now);
  const toolsWithAnHour = Object.values(stats.activeMsByTool).filter(
    (ms) => ms >= 3_600_000,
  ).length;
  return [
    { id: "first-hour", label: "Warming Up", detail: "1 active hour", earned: totalHours >= 1 },
    { id: "ten-hours", label: "Locked In", detail: "10 active hours", earned: totalHours >= 10 },
    { id: "fifty-hours", label: "Grinder", detail: "50 active hours", earned: totalHours >= 50 },
    { id: "first-combo", label: "First Combo", detail: "2+ tools in one window", earned: stats.combos >= 1 },
    { id: "combo-25", label: "Combo Artist", detail: "25 combo windows", earned: stats.combos >= 25 },
    { id: "streak-3", label: "On a Roll", detail: "3-day streak", earned: streak >= 3 },
    { id: "streak-7", label: "Week Warrior", detail: "7-day streak", earned: streak >= 7 },
    { id: "polyglot", label: "Polyglot", detail: "1h+ in 3 tools", earned: toolsWithAnHour >= 3 },
    { id: "diamond", label: "Diamond", detail: "Reach Diamond tier", earned: computeXp(stats) >= 250 },
  ];
}

/** Consecutive days ending today (or yesterday) that recorded any active time. */
export function computeStreak(
  daily: Stats["daily"],
  now = Date.now(),
): number {
  let streak = 0;
  const cursor = new Date(now);
  // Allow the streak to hold if today has no activity yet but yesterday did.
  if (!daily[dayKey(cursor.getTime())]?.activeMs) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (;;) {
    const key = dayKey(cursor.getTime());
    if (daily[key]?.activeMs) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export function buildSnapshot(
  stats: Stats,
  plan: Plan,
  activeNow: string[],
  donateUrl: string,
  now = Date.now(),
  sync: SyncState | null = null,
): Snapshot {
  const tier = computeTier(stats);
  const totalHours = totalActiveMs(stats) / 3_600_000;
  const perTool: ToolLine[] = Object.entries(stats.activeMsByTool)
    .map(([id, ms]) => ({ id, hours: ms / 3_600_000 }))
    .sort((a, b) => b.hours - a.hours);

  // Progress toward the next tier, as a percentage of the current band.
  let progressPct = 100;
  if (tier.nextAtXp !== null) {
    const bandStart = currentBandStart(tier.nextAtXp);
    const span = tier.nextAtXp - bandStart;
    progressPct = span > 0 ? Math.min(100, ((tier.xp - bandStart) / span) * 100) : 0;
  }

  return {
    tierName: tier.name,
    tierGlyph: tier.glyph,
    xp: tier.xp,
    nextAtXp: tier.nextAtXp,
    progressPct,
    totalHours,
    perTool,
    combos: stats.combos,
    plan,
    planBadge: planBadge(plan),
    streakDays: computeStreak(stats.daily, now),
    activeNow,
    achievements: computeAchievements(stats, now),
    sync: sync && sync.status !== "disabled" ? sync : null,
    donateUrl,
    generatedAt: new Date(now).toISOString(),
  };
}

/** Lower bound of the current tier band: the largest threshold below the next tier. */
function currentBandStart(nextAtXp: number): number {
  let start = 0;
  for (const t of TIERS) {
    if (t.xp < nextAtXp) start = t.xp;
    else break;
  }
  return start;
}
