import type { Stats, ToolActivity } from "./types.js";

export interface TrackerOptions {
  /** Window size for combo detection. 2+ tools active in the same window = 1 combo. */
  comboBucketMs?: number;
  /**
   * Upper bound on the time credited for a single tick. Protects against the
   * machine sleeping between ticks (a 6-hour gap must not become 6 active hours).
   */
  maxElapsedMs?: number;
}

/** Local calendar day key, e.g. "2026-07-08". */
export function dayKey(now: number): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Accumulates active time and combo windows into a Stats object. Kept pure and
 * clock-injectable so it can be unit-tested deterministically.
 */
export class Tracker {
  private readonly comboBucketMs: number;
  private readonly maxElapsedMs: number;

  constructor(opts: TrackerOptions = {}) {
    this.comboBucketMs = opts.comboBucketMs ?? 5 * 60_000;
    this.maxElapsedMs = opts.maxElapsedMs ?? 30_000;
  }

  /**
   * Fold one detection pass into `stats`. `elapsedMs` is wall time since the
   * previous tick. Mutates and returns `stats`.
   */
  recordTick(
    stats: Stats,
    activities: ToolActivity[],
    now: number,
    elapsedMs: number,
  ): Stats {
    const credit = Math.max(0, Math.min(elapsedMs, this.maxElapsedMs));
    const activeTools = activities.filter((a) => a.active);
    if (activeTools.length === 0) return stats;

    const day = dayKey(now);
    const daily = (stats.daily[day] ??= { activeMs: 0, combos: 0 });

    for (const tool of activeTools) {
      stats.activeMsByTool[tool.id] = (stats.activeMsByTool[tool.id] ?? 0) + credit;
    }
    daily.activeMs += credit;
    stats.lastActive = new Date(now).toISOString();

    // Combo: 2+ tools active within the same time bucket, counted once per bucket.
    if (activeTools.length >= 2) {
      const bucketId = String(Math.floor(now / this.comboBucketMs));
      if (!stats.countedComboBuckets.includes(bucketId)) {
        stats.countedComboBuckets.push(bucketId);
        // keep the list bounded — we only need recent buckets for dedupe
        if (stats.countedComboBuckets.length > 512) {
          stats.countedComboBuckets.splice(0, stats.countedComboBuckets.length - 512);
        }
        stats.combos += 1;
        daily.combos += 1;
      }
    }
    return stats;
  }
}
