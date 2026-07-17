// UTC day and ISO-week helpers. A shared board needs one global clock, so every
// boundary here is UTC — never the viewer's local time. The week runs Monday
// 00:00 → Sunday 23:59 UTC and resets every Monday.

const DAY_MS = 86_400_000;

/** The UTC calendar day of `ms`, as "YYYY-MM-DD". */
export function dayKeyUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The 7 UTC day keys (Monday→Sunday) of the ISO week containing `ms`. */
export function isoWeekDaysUtc(ms: number): string[] {
  const d = new Date(ms);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0 … Sunday = 6
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
  return Array.from({ length: 7 }, (_, i) => dayKeyUtc(monday + i * DAY_MS));
}

export interface WeekRange {
  /** Monday's day key — also the stable identity of the week (cache key). */
  start: string;
  /** Sunday's day key. */
  end: string;
  /** All 7 day keys, Monday→Sunday. */
  days: string[];
}

/** The current ISO week as an inclusive [start, end] day-key range plus its days. */
export function isoWeekRangeUtc(ms: number): WeekRange {
  const days = isoWeekDaysUtc(ms);
  return { start: days[0]!, end: days[6]!, days };
}
