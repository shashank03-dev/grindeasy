import { describe, expect, it } from "vitest";
import { buildActivity, REPO_URL, type PresenceOptions, type PresenceState } from "../src/presence.js";
import type { TierResult } from "../src/types.js";

const PLATINUM: TierResult = { name: "Platinum", glyph: "◆", xp: 120, nextAtXp: 250 };

const opts: PresenceOptions = {
  clientId: "123",
  donateUrl: "https://coffee.example",
  showIdlePresence: true,
};

function state(over: Partial<PresenceState> = {}): PresenceState {
  return {
    activeToolNames: ["Claude Code", "Codex"],
    tier: PLATINUM,
    plan: "pro",
    sessionStartMs: 1_000,
    rank: null,
    ...over,
  };
}

describe("buildActivity", () => {
  it("puts the rank in front of the tier line", () => {
    const activity = buildActivity(state({ rank: 12 }), opts);
    expect(activity?.details).toBe("Coding · Claude Code + Codex");
    expect(activity?.state).toBe("#12 on viberank · ◆ Platinum · PRO");
  });

  it("falls back to the plain tier line when rank is unknown", () => {
    // Sync off, unpaired, or the board is down — the card must not degrade.
    expect(buildActivity(state({ rank: null }), opts)?.state).toBe("◆ Platinum · PRO");
  });

  it("shows rank while idle too, so the card keeps standing visible", () => {
    const activity = buildActivity(state({ activeToolNames: [], sessionStartMs: null, rank: 3 }), opts);
    expect(activity?.details).toBe("Idle");
    expect(activity?.state).toBe("#3 on viberank · ◆ Platinum · PRO");
    expect(activity?.startTimestamp).toBeUndefined();
  });

  it("clears the card when idle and idle presence is off", () => {
    expect(buildActivity(state({ activeToolNames: [] }), { ...opts, showIdlePresence: false })).toBeNull();
  });

  it("keeps both lines inside Discord's 128-char limit", () => {
    const activity = buildActivity(
      state({
        activeToolNames: Array.from({ length: 20 }, (_, i) => `Very Long Tool Name ${i}`),
        rank: 999_999,
        tier: { ...PLATINUM, name: "Platinum".repeat(20) },
      }),
      opts,
    );
    expect((activity?.details as string).length).toBeLessThanOrEqual(128);
    expect((activity?.state as string).length).toBeLessThanOrEqual(128);
  });

  it("sets the session timer only while active", () => {
    expect(buildActivity(state({ sessionStartMs: 5_000 }), opts)?.startTimestamp).toBe(5_000);
  });

  it("keeps the existing buttons", () => {
    expect(buildActivity(state(), opts)?.buttons).toEqual([
      { label: "⚡ Get viberank", url: REPO_URL },
      { label: "☕ Support", url: "https://coffee.example" },
    ]);
  });
});
