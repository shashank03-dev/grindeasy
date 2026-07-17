import type { RecapResult, WeeklySummary } from "./snapshot.js";

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

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekdayShort(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return WEEKDAY_SHORT[new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay()] ?? "";
}

function deltaLine(summary: WeeklySummary): string {
  if (summary.isFirstWeek) return "first week tracked";
  if (Math.abs(summary.deltaHours) < 0.05) return "level with the week before";
  const arrow = summary.deltaHours > 0 ? "▲" : "▼";
  return `${arrow} ${fmtHours(Math.abs(summary.deltaHours))} vs the week before`;
}

/**
 * Render a weekly summary as Slack mrkdwn text. Plain text on purpose — the
 * terminal panel's ANSI colors would show up as escape codes in Slack.
 */
export function formatWeeklyRecap(summary: WeeklySummary): string {
  const lines: string[] = [];
  lines.push("*grindeasy · last week*");
  lines.push(`*${fmtHours(summary.activeHours)}* active — ${deltaLine(summary)}`);

  const stats = [`avg ${fmtHours(summary.avgHoursPerDay)}/day`, `active ${summary.activeDays} of 7 days`];
  if (summary.bestDay) {
    stats.push(`best day ${fmtHours(summary.bestDay.hours)} (${weekdayShort(summary.bestDay.day)})`);
  }
  lines.push(stats.join(" · "));

  if (summary.perTool.length) {
    lines.push("");
    lines.push("*By tool*");
    for (const t of summary.perTool) {
      lines.push(`• ${label(t.id)} — ${fmtHours(t.hours)}`);
    }
  }

  if (summary.combos > 0) {
    lines.push("");
    lines.push(`${summary.combos} combo${summary.combos === 1 ? "" : "s"}`);
  }

  if (summary.goalPct !== null) {
    lines.push("");
    lines.push(
      `Goal ${fmtHours(summary.activeHours)} / ${fmtHours(summary.goalHours)} · ${Math.round(summary.goalPct)}%`,
    );
  }

  return lines.join("\n");
}

/** POST a message to a Slack Incoming Webhook. Never throws; failures are returned. */
export async function postSlackMessage(
  url: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export type RecapAction =
  | { kind: "skip" }
  | { kind: "mark"; week: string }
  | { kind: "post"; week: string; text: string };

/**
 * Decide what the weekly-recap notifier should do this tick. Pure: the caller
 * runs the effect (post, persist the marker, or set a backoff) based on the
 * returned action.
 */
export function planWeeklyRecapDelivery(args: {
  webhookUrl: string;
  lastWebhookRecapWeek: string;
  recap: RecapResult;
  now: number;
  nextAttemptMs: number;
}): RecapAction {
  const { webhookUrl, lastWebhookRecapWeek, recap, now, nextAttemptMs } = args;
  if (!webhookUrl) return { kind: "skip" };
  if (recap.currentWeek === lastWebhookRecapWeek) return { kind: "skip" };
  if (now < nextAttemptMs) return { kind: "skip" };
  if (!recap.summary) return { kind: "mark", week: recap.currentWeek };
  return { kind: "post", week: recap.currentWeek, text: formatWeeklyRecap(recap.summary) };
}
