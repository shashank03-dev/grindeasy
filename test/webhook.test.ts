import { afterEach, describe, expect, it, vi } from "vitest";
import { computeWeekly } from "../src/snapshot.js";
import { freshStats } from "../src/store.js";
import { dayKey } from "../src/tracker.js";
import {
  formatWeeklyRecap,
  planWeeklyRecapDelivery,
  postSlackMessage,
} from "../src/webhook.js";
import type { RecapResult, WeeklySummary } from "../src/snapshot.js";
import type { Stats } from "../src/types.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;

function statsFromDays(
  now: number,
  days: Record<number, number>,
  tool = "claude-code",
): Stats {
  const s = freshStats(0);
  for (const [offset, hours] of Object.entries(days)) {
    const key = dayKey(now - Number(offset) * DAY);
    s.daily[key] = { activeMs: hours * HOUR, combos: 0, byTool: { [tool]: hours * HOUR } };
  }
  return s;
}

describe("formatWeeklyRecap", () => {
  const now = Date.parse("2026-07-16T12:00:00Z");

  it("leads with active hours and the first-week note when there's no prior history", () => {
    const summary = computeWeekly(statsFromDays(now, { 0: 2, 1: 1 }), now);
    const out = formatWeeklyRecap(summary);
    expect(out).toContain("*grindeasy · last week*");
    expect(out).toContain("3.0h");
    expect(out).toContain("first week tracked");
  });

  it("shows a week-over-week delta once there is prior history", () => {
    // 5h this week (offsets 0-1), 2h the week before (offset 8).
    const summary = computeWeekly(statsFromDays(now, { 0: 3, 1: 2, 8: 2 }), now);
    const out = formatWeeklyRecap(summary);
    expect(out).toContain("vs the week before");
    expect(out).not.toContain("first week tracked");
  });

  it("lists per-tool hours under a By tool heading", () => {
    const s = freshStats(0);
    const key = dayKey(now);
    s.daily[key] = {
      activeMs: 3 * HOUR,
      combos: 0,
      byTool: { "claude-code": 2 * HOUR, codex: 1 * HOUR },
    };
    const out = formatWeeklyRecap(computeWeekly(s, now));
    expect(out).toContain("*By tool*");
    expect(out).toContain("Claude Code — 2.0h");
    expect(out).toContain("Codex — 1.0h");
  });

  it("omits the combos line when there are no combos", () => {
    const out = formatWeeklyRecap(computeWeekly(statsFromDays(now, { 0: 2 }), now));
    expect(out).not.toMatch(/combo/);
  });

  it("shows the goal line only when a goal is set", () => {
    const s = statsFromDays(now, { 0: 4 });
    expect(formatWeeklyRecap(computeWeekly(s, now, 0))).not.toContain("Goal");
    expect(formatWeeklyRecap(computeWeekly(s, now, 10))).toContain("Goal");
  });
});

function recap(currentWeek: string, summary: WeeklySummary | null): RecapResult {
  return { currentWeek, summary };
}

describe("planWeeklyRecapDelivery", () => {
  const now = Date.parse("2026-07-16T12:00:00Z");
  const summary = computeWeekly(statsFromDays(now, { 0: 2 }), now);

  it("skips when no webhook URL is configured", () => {
    const action = planWeeklyRecapDelivery({
      webhookUrl: "",
      lastWebhookRecapWeek: "",
      recap: recap("2026-W29", summary),
      now,
      nextAttemptMs: 0,
    });
    expect(action.kind).toBe("skip");
  });

  it("skips when this week's recap was already delivered", () => {
    const action = planWeeklyRecapDelivery({
      webhookUrl: "https://hooks.slack.test/x",
      lastWebhookRecapWeek: "2026-W29",
      recap: recap("2026-W29", summary),
      now,
      nextAttemptMs: 0,
    });
    expect(action.kind).toBe("skip");
  });

  it("skips while inside the failure backoff window", () => {
    const action = planWeeklyRecapDelivery({
      webhookUrl: "https://hooks.slack.test/x",
      lastWebhookRecapWeek: "",
      recap: recap("2026-W29", summary),
      now,
      nextAttemptMs: now + 60_000,
    });
    expect(action.kind).toBe("skip");
  });

  it("marks the week (no post) when there's nothing to report", () => {
    const action = planWeeklyRecapDelivery({
      webhookUrl: "https://hooks.slack.test/x",
      lastWebhookRecapWeek: "",
      recap: recap("2026-W29", null),
      now,
      nextAttemptMs: 0,
    });
    expect(action).toEqual({ kind: "mark", week: "2026-W29" });
  });

  it("posts the formatted recap for a new week with activity", () => {
    const action = planWeeklyRecapDelivery({
      webhookUrl: "https://hooks.slack.test/x",
      lastWebhookRecapWeek: "2026-W28",
      recap: recap("2026-W29", summary),
      now,
      nextAttemptMs: 0,
    });
    expect(action.kind).toBe("post");
    if (action.kind === "post") {
      expect(action.week).toBe("2026-W29");
      expect(action.text).toContain("*grindeasy · last week*");
    }
  });
});

describe("postSlackMessage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns ok on a 2xx response", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await postSlackMessage("https://hooks.slack.test/x", "hi");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ text: "hi" });
  });

  it("returns the HTTP status on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 404 })));
    const result = await postSlackMessage("https://hooks.slack.test/x", "hi");
    expect(result).toEqual({ ok: false, error: "HTTP 404" });
  });

  it("returns the error message when the request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const result = await postSlackMessage("https://hooks.slack.test/x", "hi");
    expect(result).toEqual({ ok: false, error: "network down" });
  });
});
