import type { Records, WeeklySummary } from "./snapshot.js";
import { deep, dim, dimmer, panel, phosphor } from "./theme.js";

const TOOL_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  aider: "Aider",
};

function label(id: string): string {
  return TOOL_LABELS[id] ?? id;
}

function fmtHours(h: number): string {
  return h < 1 ? `${Math.round(h * 60)}m` : `${h.toFixed(1)}h`;
}

const BLOCKS = "▁▂▃▄▅▆▇█";

/** A unicode bar sparkline for the 7 daily values. */
export function sparkline(values: number[]): string {
  const max = Math.max(0, ...values);
  if (max <= 0) return BLOCKS[0]!.repeat(values.length);
  return values
    .map((v) => {
      const idx = Math.min(BLOCKS.length - 1, Math.round((v / max) * (BLOCKS.length - 1)));
      return BLOCKS[v <= 0 ? 0 : idx]!;
    })
    .join("");
}

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayOfWeek(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay();
}

/** Single-letter weekday initials under each day of the window. */
function weekdayRow(days: string[]): string {
  return days.map((k) => WEEKDAY[dayOfWeek(k)]).join("");
}

/** A 10-cell filled/empty bar for goal progress. */
function goalBar(pct: number): string {
  const filled = Math.round(Math.min(100, Math.max(0, pct)) / 10);
  return phosphor("█".repeat(filled)) + dimmer("░".repeat(10 - filled));
}

function deltaLine(delta: number): string {
  if (Math.abs(delta) < 0.05) return dim("level with last week");
  const arrow = delta > 0 ? "▲" : "▼";
  const tint = delta > 0 ? phosphor : dimmer;
  return tint(`${arrow} ${fmtHours(Math.abs(delta))} vs last week`);
}

/**
 * Render the weekly summary as a themed terminal panel. Used by `grindeasy
 * weekly` and by the auto recap (which passes its own title). `records` adds an
 * all-time bests footer when supplied.
 */
export function renderWeeklyPanel(
  summary: WeeklySummary,
  opts: { title?: string; records?: Records } = {},
): string {
  const lines: string[] = [];

  const compare = summary.isFirstWeek
    ? dim("first week tracked")
    : deltaLine(summary.deltaHours);
  lines.push(`${phosphor(fmtHours(summary.activeHours))}   ${compare}`);
  lines.push(`${dim(weekdayRow(summary.days))}`);
  lines.push(`${deep(sparkline(summary.perDay.map((d) => d.hours)))}`);
  lines.push("");
  lines.push(
    `${dim("avg")}   ${fmtHours(summary.avgHoursPerDay)}/day   ${dim("·")}   ${summary.activeDays} of 7 days active`,
  );

  if (summary.bestDay) {
    const dow = WEEKDAY_SHORT[dayOfWeek(summary.bestDay.day)];
    lines.push(`${dim("best")}  ${dow} ${summary.bestDay.day.slice(5)} · ${fmtHours(summary.bestDay.hours)}`);
  }
  if (summary.mostUsedTool) {
    lines.push(
      `${dim("top")}   ${label(summary.mostUsedTool.id)}   ${dim(`${Math.round(summary.mostUsedTool.sharePct)}% of the week`)}`,
    );
  }
  if (summary.combos > 0) {
    lines.push(`${dim("combos")} ${summary.combos}`);
  }
  if (summary.goalPct !== null) {
    lines.push("");
    lines.push(
      `${dim("goal")}  ${goalBar(summary.goalPct)}  ${fmtHours(summary.activeHours)} / ${fmtHours(
        summary.goalHours,
      )}  ${dim(`${Math.round(summary.goalPct)}%`)}`,
    );
  }
  if (opts.records && opts.records.bestWeekHours > 0) {
    lines.push("");
    lines.push(
      dim(
        `best week ${fmtHours(opts.records.bestWeekHours)} · longest streak ${opts.records.longestStreak}d`,
      ),
    );
  }
  if (summary.activeHours === 0) {
    return panel(opts.title ?? "this week", [dim("No activity in the last 7 days — start coding.")]);
  }

  return panel(opts.title ?? "this week", lines);
}
