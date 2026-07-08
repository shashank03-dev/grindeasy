import { describe, expect, it } from "vitest";
import { rankBoard, type BoardRow } from "../src/leaderboard.js";

const H = 3_600_000;

function row(overrides: Partial<BoardRow>): BoardRow {
  return {
    discordId: "1",
    username: "user",
    avatar: null,
    plan: "pro",
    activeMs: 0,
    combos: 0,
    ...overrides,
  };
}

describe("rankBoard", () => {
  it("ranks by xp (hours + combos*0.25) regardless of plan", () => {
    const entries = rankBoard([
      row({ discordId: "a", username: "api-user", plan: "api", activeMs: 10 * H }),
      row({ discordId: "b", username: "max-user", plan: "max", activeMs: 5 * H }),
      // 5 hours + 24 combos = 11 XP, beats the 10-hour api user.
      row({ discordId: "c", username: "combo-user", plan: "pro", activeMs: 5 * H, combos: 24 }),
    ]);
    expect(entries.map((e) => e.username)).toEqual(["combo-user", "api-user", "max-user"]);
    expect(entries[0]?.rank).toBe(1);
    expect(entries[0]?.xp).toBeCloseTo(11);
  });

  it("maps tiers and plan badges", () => {
    const [e] = rankBoard([row({ activeMs: 45 * H, plan: "max" })]);
    expect(e?.tierName).toBe("Gold");
    expect(e?.planBadge).toBe("MAX");
  });

  it("respects the limit", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ discordId: String(i), username: `u${i}`, activeMs: i * H }),
    );
    expect(rankBoard(rows, 3)).toHaveLength(3);
  });

  it("builds avatar urls only when an avatar hash exists", () => {
    const entries = rankBoard([
      row({ discordId: "42", username: "with", avatar: "abc" }),
      row({ discordId: "43", username: "without", avatar: null }),
    ]);
    expect(entries.find((e) => e.username === "with")?.avatarUrl).toBe(
      "https://cdn.discordapp.com/avatars/42/abc.png?size=64",
    );
    expect(entries.find((e) => e.username === "without")?.avatarUrl).toBeNull();
  });
});
