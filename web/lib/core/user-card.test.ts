import { describe, expect, it } from "vitest";
import type { BoardRow } from "./leaderboard";
import { ONLINE_WINDOW_MS } from "./presence";
import {
  buildUserCard,
  buildWeeklyUserCard,
  type UserCardInput,
  type WeeklyUserCardInput,
} from "./user-card";

const HOUR = 3_600_000;
const NOW = 1_700_000_000_000;

function input(overrides: Partial<UserCardInput> = {}): UserCardInput {
  return {
    username: "ada",
    avatar: null,
    discordId: "111",
    plan: "pro",
    combos: 0,
    toolTotalsMs: {},
    boardRows: [],
    presence: { lastActiveAt: null, lastSeenAt: null, activeNow: null },
    now: NOW,
    ...overrides,
  };
}

describe("buildUserCard", () => {
  it("derives tier, hours, xp and per-tool breakdown from raw totals", () => {
    const card = buildUserCard(
      input({ toolTotalsMs: { "claude-code": 12 * HOUR, codex: 3 * HOUR }, combos: 4 }),
    );
    // 15 active hours + 4 combos × 0.25 = 16 xp → Silver (≥10), below Gold (40).
    expect(card.hours).toBeCloseTo(15);
    expect(card.xp).toBeCloseTo(16);
    expect(card.tierName).toBe("Silver");
    expect(card.perTool).toEqual([
      { id: "claude-code", hours: 12 },
      { id: "codex", hours: 3 },
    ]);
    expect(card.xpToNext).toBeCloseTo(40 - 16);
  });

  it("ranks the user against the whole field", () => {
    const rows: BoardRow[] = [
      { discordId: "999", username: "top", avatar: null, plan: "pro", activeMs: 100 * HOUR, combos: 0 },
      { discordId: "111", username: "ada", avatar: null, plan: "pro", activeMs: 10 * HOUR, combos: 0 },
    ];
    const card = buildUserCard(input({ boardRows: rows, toolTotalsMs: { codex: 10 * HOUR } }));
    expect(card.rank).toBe(2);
    expect(card.totalPlayers).toBe(2);
  });

  it("has null rank when the user is not on the board yet", () => {
    expect(buildUserCard(input()).rank).toBeNull();
  });

  it("builds a Discord avatar URL only when an avatar hash is present", () => {
    expect(buildUserCard(input({ avatar: "abc" })).avatarUrl).toBe(
      "https://cdn.discordapp.com/avatars/111/abc.png?size=64",
    );
    expect(buildUserCard(input()).avatarUrl).toBeNull();
  });

  it("surfaces active tools only while online", () => {
    const online = buildUserCard(
      input({
        presence: { lastActiveAt: new Date(NOW - 10_000), lastSeenAt: null, activeNow: ["codex"] },
      }),
    );
    expect(online.isOnline).toBe(true);
    expect(online.activeTools).toEqual(["codex"]);

    const stale = buildUserCard(
      input({
        presence: {
          lastActiveAt: new Date(NOW - ONLINE_WINDOW_MS - 1),
          lastSeenAt: null,
          activeNow: ["codex"],
        },
      }),
    );
    expect(stale.isOnline).toBe(false);
    expect(stale.activeTools).toEqual([]);
  });
});

describe("buildWeeklyUserCard", () => {
  const WEEK = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19"];

  function weeklyInput(overrides: Partial<WeeklyUserCardInput> = {}): WeeklyUserCardInput {
    return {
      username: "ada",
      avatar: null,
      discordId: "111",
      plan: "pro",
      lifetimeToolTotalsMs: {},
      lifetimeCombos: 0,
      weeklyToolTotalsMs: {},
      weeklyCombos: 0,
      weeklyBoardRows: [],
      perDay: [0, 0, 0, 0, 0, 0, 0],
      weekDays: WEEK,
      presence: { lastActiveAt: null, lastSeenAt: null, activeNow: null },
      now: NOW,
      ...overrides,
    };
  }

  it("takes tier and level from lifetime totals but the stats from this week", () => {
    const card = buildWeeklyUserCard(
      weeklyInput({
        // Lifetime: 120h → Platinum (≥100), XP 120.
        lifetimeToolTotalsMs: { "claude-code": 120 * HOUR },
        // This week: only 3h and 1 combo.
        weeklyToolTotalsMs: { "claude-code": 3 * HOUR },
        weeklyCombos: 1,
      }),
    );
    expect(card.tierName).toBe("Platinum");
    expect(card.xp).toBeCloseTo(120); // level line is lifetime
    expect(card.hours).toBeCloseTo(3); // Active is weekly
    expect(card.combos).toBe(1); // Combos is weekly
    expect(card.xpToNext).toBeCloseTo(250 - 120); // Diamond, from lifetime
  });

  it("ranks against the weekly board, not the all-time one", () => {
    const rows: BoardRow[] = [
      { discordId: "999", username: "top", avatar: null, plan: "pro", activeMs: 8 * HOUR, combos: 0 },
      { discordId: "111", username: "ada", avatar: null, plan: "pro", activeMs: 3 * HOUR, combos: 0 },
    ];
    const card = buildWeeklyUserCard(
      weeklyInput({ weeklyBoardRows: rows, weeklyToolTotalsMs: { "claude-code": 3 * HOUR } }),
    );
    expect(card.rank).toBe(2);
    expect(card.totalPlayers).toBe(2);
  });

  it("builds a 7-bar histogram labelled Monday→Sunday, aligned to perDay", () => {
    const card = buildWeeklyUserCard(
      weeklyInput({ perDay: [HOUR, 0, 0, 2 * HOUR, 0, 0, 0] }),
    );
    expect(card.histogram).toEqual([
      { label: "M", hours: 1 },
      { label: "T", hours: 0 },
      { label: "W", hours: 0 },
      { label: "T", hours: 2 },
      { label: "F", hours: 0 },
      { label: "S", hours: 0 },
      { label: "S", hours: 0 },
    ]);
  });

  it("marks a paired-but-idle-this-week user as everPaired so they keep the weekly view", () => {
    const card = buildWeeklyUserCard(
      weeklyInput({
        lifetimeToolTotalsMs: { "claude-code": 50 * HOUR }, // has lifetime history
        weeklyToolTotalsMs: {}, // nothing this week
      }),
    );
    expect(card.everPaired).toBe(true);
    expect(card.hours).toBe(0);
  });

  it("marks a never-active user as not everPaired", () => {
    expect(buildWeeklyUserCard(weeklyInput()).everPaired).toBe(false);
  });
});
