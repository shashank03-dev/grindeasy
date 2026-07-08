import { planBadge } from "./plan.js";
import { computeTier, TIERS, totalActiveMs } from "./tiers.js";
import { dayKey } from "./tracker.js";
import type { Plan, Stats } from "./types.js";

export interface ToolLine {
  id: string;
  hours: number;
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
  donateUrl: string;
  generatedAt: string;
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
