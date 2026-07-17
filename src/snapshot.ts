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

/** Most-used tool over a window, with its share of the window's active time. */
export interface TopTool {
  id: string;
  hours: number;
  sharePct: number;
}

/** One day's active hours, for the weekly bar/sparkline. */
export interface DayHours {
  day: string;
  hours: number;
}

/**
 * A summary of one 7-day window. Used for the rolling weekly card, the auto
 * recap of a just-completed ISO week, and (per-week) the monthly trend.
 */
export interface WeeklySummary {
  /** ISO day keys of the window, oldest → newest. */
  days: string[];
  activeHours: number;
  combos: number;
  perTool: ToolLine[];
  mostUsedTool: TopTool | null;
  perDay: DayHours[];
  /** Average over the days that had activity (0 when none did). */
  avgHoursPerDay: number;
  bestDay: DayHours | null;
  activeDays: number;
  /** This window's hours minus the immediately preceding window's. */
  deltaHours: number;
  /** Configured weekly goal in hours (0 = no goal). */
  goalHours: number;
  /** Progress toward the goal as a percent, or null when no goal is set. */
  goalPct: number | null;
  /** True when no tracked activity precedes this window — no "last week" to compare against. */
  isFirstWeek: boolean;
}

/** One week in the 4-week trend. */
export interface MonthlyWeek {
  label: string;
  hours: number;
  mostUsedToolId: string | null;
}

/** All-time personal bests, computed from retained daily history. */
export interface Records {
  /** Most active hours in any rolling 7-day window. */
  bestWeekHours: number;
  /** Day the best week ended (its newest day key), or null with no history. */
  bestWeekEnd: string | null;
  /** Longest run of consecutive days with any activity. */
  longestStreak: number;
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
  /** Rolling last-7-days summary. */
  weekly: WeeklySummary;
  /** Last 4 rolling weeks, oldest → newest. */
  monthly: MonthlyWeek[];
  /** All-time personal bests. */
  records: Records;
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

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

type Daily = Stats["daily"];

function hoursOf(daily: Daily, key: string): number {
  return (daily[key]?.activeMs ?? 0) / HOUR_MS;
}

/** Per-tool active ms for a day, tolerating pre-0.5.3 days that lack byTool. */
function byToolOf(daily: Daily, key: string): Record<string, number> {
  return daily[key]?.byTool ?? {};
}

/** Local day key for `offset` days before `now` (offset 0 = today). */
function dayKeyBack(now: number, offset: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - offset);
  return dayKey(d.getTime());
}

/** `count` day keys ending `offset` days before today, oldest → newest. */
function windowKeys(now: number, count: number, offset: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1 + offset; i >= offset; i--) keys.push(dayKeyBack(now, i));
  return keys;
}

/** Sum of active hours over the given day keys. */
function sumHours(daily: Daily, keys: string[]): number {
  return keys.reduce((acc, k) => acc + hoursOf(daily, k), 0);
}

/** Aggregate per-tool hours across the given day keys, sorted descending. */
function perToolOver(daily: Daily, keys: string[]): ToolLine[] {
  const ms: Record<string, number> = {};
  for (const k of keys) {
    for (const [id, v] of Object.entries(byToolOf(daily, k))) ms[id] = (ms[id] ?? 0) + v;
  }
  return Object.entries(ms)
    .map(([id, m]) => ({ id, hours: m / HOUR_MS }))
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Summarize one window of day keys (oldest → newest), with `priorKeys` as the
 * immediately preceding window used only for the delta. Pure — the same routine
 * serves the rolling weekly card and the ISO-week recap.
 */
function summarizeWindow(
  daily: Daily,
  keys: string[],
  priorKeys: string[],
  goalHours: number,
): WeeklySummary {
  const perDay: DayHours[] = keys.map((day) => ({ day, hours: hoursOf(daily, day) }));
  const activeHours = perDay.reduce((acc, d) => acc + d.hours, 0);
  const combos = keys.reduce((acc, k) => acc + (daily[k]?.combos ?? 0), 0);
  const perTool = perToolOver(daily, keys);
  const mostUsedTool: TopTool | null = perTool[0]
    ? {
        id: perTool[0].id,
        hours: perTool[0].hours,
        sharePct: activeHours > 0 ? (perTool[0].hours / activeHours) * 100 : 0,
      }
    : null;
  const activeDays = perDay.filter((d) => d.hours > 0).length;
  const bestDay = perDay.reduce<DayHours | null>(
    (best, d) => (d.hours > 0 && (!best || d.hours > best.hours) ? d : best),
    null,
  );
  // Day keys are YYYY-MM-DD, so a plain string compare orders them. Anything
  // active before this window means there *is* a prior week to compare against —
  // an idle prior window still counts as history, and its delta is real.
  const windowStart = keys[0] ?? "";
  const hasPriorHistory = Object.keys(daily).some(
    (k) => k < windowStart && (daily[k]?.activeMs ?? 0) > 0,
  );
  return {
    days: keys,
    activeHours,
    combos,
    perTool,
    mostUsedTool,
    perDay,
    avgHoursPerDay: activeDays > 0 ? activeHours / activeDays : 0,
    bestDay,
    activeDays,
    deltaHours: activeHours - sumHours(daily, priorKeys),
    goalHours,
    goalPct: goalHours > 0 ? Math.min(100, (activeHours / goalHours) * 100) : null,
    isFirstWeek: !hasPriorHistory,
  };
}

/** Rolling last-7-days summary, delta vs the 7 days before that. */
export function computeWeekly(stats: Stats, now = Date.now(), goalHours = 0): WeeklySummary {
  return summarizeWindow(
    stats.daily,
    windowKeys(now, 7, 0),
    windowKeys(now, 7, 7),
    goalHours,
  );
}

/** The last 4 rolling weeks, oldest → newest, for the trend view. */
export function computeMonthly(stats: Stats, now = Date.now()): MonthlyWeek[] {
  const weeks: MonthlyWeek[] = [];
  for (let w = 0; w < 4; w++) {
    const keys = windowKeys(now, 7, w * 7);
    const top = perToolOver(stats.daily, keys)[0];
    weeks.push({
      label: w === 0 ? "This week" : w === 1 ? "Last week" : `${w} wks ago`,
      hours: sumHours(stats.daily, keys),
      mostUsedToolId: top ? top.id : null,
    });
  }
  return weeks.reverse();
}

function parseDayKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime();
}

/** Day keys from `startMs` through today (now), inclusive, oldest → newest. */
function daysThrough(startMs: number, now: number): string[] {
  const out: string[] = [];
  const end = dayKey(now);
  const d = new Date(startMs);
  for (;;) {
    const k = dayKey(d.getTime());
    out.push(k);
    if (k === end) break;
    d.setDate(d.getDate() + 1);
    if (out.length > 4000) break; // ~11 years — a safety bound, never hit in practice
  }
  return out;
}

/** All-time bests from retained history: best rolling week, longest streak. */
export function computeRecords(stats: Stats, now = Date.now()): Records {
  const daily = stats.daily;
  const activeKeys = Object.keys(daily)
    .filter((k) => (daily[k]?.activeMs ?? 0) > 0)
    .sort();
  if (activeKeys.length === 0) return { bestWeekHours: 0, bestWeekEnd: null, longestStreak: 0 };

  const timeline = daysThrough(parseDayKey(activeKeys[0]!), now);

  let bestWeekHours = 0;
  let bestWeekEnd: string | null = null;
  let longestStreak = 0;
  let run = 0;
  for (let i = 0; i < timeline.length; i++) {
    const key = timeline[i]!;
    // Longest streak: consecutive active days.
    if ((daily[key]?.activeMs ?? 0) > 0) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
    // Best week: the 7-day window ending on this day.
    const window = timeline.slice(Math.max(0, i - 6), i + 1);
    const hours = sumHours(daily, window);
    if (hours > bestWeekHours) {
      bestWeekHours = hours;
      bestWeekEnd = key;
    }
  }
  return { bestWeekHours, bestWeekEnd, longestStreak };
}

/** Monday 00:00 of the ISO week containing `ms`. */
function isoWeekStartMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

/** ISO week key, e.g. "2026-W29". */
export function isoWeekKey(ms: number): string {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  // Shift to the Thursday of this week — that's the day that fixes the ISO year.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const isoYear = d.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** `count` day keys starting at `startMs`, oldest → newest. */
function daysFrom(startMs: number, count: number): string[] {
  const out: string[] = [];
  const d = new Date(startMs);
  for (let i = 0; i < count; i++) {
    out.push(dayKey(d.getTime()));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** What the auto weekly recap needs: the current ISO week, and last week's summary. */
export interface RecapResult {
  /** ISO week key of the current week — persist this once the recap is shown. */
  currentWeek: string;
  /** Summary of the just-completed ISO week, or null when it had no activity. */
  summary: WeeklySummary | null;
}

/**
 * Compute the recap for the ISO week that just ended (Mon–Sun before this week),
 * with its delta measured against the week before it. `summary` is null when
 * that week had no activity, so the caller shows nothing.
 */
export function computeRecap(stats: Stats, now = Date.now(), goalHours = 0): RecapResult {
  const thisWeekStart = isoWeekStartMs(now);
  const lastWeekStart = thisWeekStart - 7 * DAY_MS;
  const priorWeekStart = thisWeekStart - 14 * DAY_MS;
  const summary = summarizeWindow(
    stats.daily,
    daysFrom(lastWeekStart, 7),
    daysFrom(priorWeekStart, 7),
    goalHours,
  );
  return {
    currentWeek: isoWeekKey(now),
    summary: summary.activeHours > 0 ? summary : null,
  };
}

export function buildSnapshot(
  stats: Stats,
  plan: Plan,
  activeNow: string[],
  donateUrl: string,
  now = Date.now(),
  sync: SyncState | null = null,
  weeklyGoalHours = 0,
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
    weekly: computeWeekly(stats, now, weeklyGoalHours),
    monthly: computeMonthly(stats, now),
    records: computeRecords(stats, now),
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
