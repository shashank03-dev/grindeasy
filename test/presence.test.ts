import { describe, expect, it } from "vitest";
import type { Client } from "@xhayper/discord-rpc";
import {
  buildActivity,
  PresenceManager,
  presenceKey,
  REPO_URL,
  type PresenceOptions,
  type PresenceState,
} from "../src/presence.js";
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
    serverTier: null,
    plan: "pro",
    sessionStartMs: 1_000,
    rank: null,
    totalPlayers: null,
    ...over,
  };
}

describe("buildActivity", () => {
  it("puts the rank in front of the tier line", () => {
    const activity = buildActivity(state({ rank: 12 }), opts);
    expect(activity?.details).toBe("Coding · Claude Code + Codex");
    expect(activity?.state).toBe("#12 · ◆ Platinum · PRO");
  });

  it("shows the field size as 'of N' once the server reports it", () => {
    expect(buildActivity(state({ rank: 12, totalPlayers: 40 }), opts)?.state).toBe(
      "#12 of 40 · ◆ Platinum · PRO",
    );
  });

  it("prefers the server's tier over the local estimate, so the badge matches the board", () => {
    // Local tier is Platinum, but the server scored the (clamped) totals as Bronze.
    const activity = buildActivity(
      state({ rank: 2, totalPlayers: 5, serverTier: { name: "Bronze", glyph: "▲" } }),
      opts,
    );
    expect(activity?.state).toBe("#2 of 5 · ▲ Bronze · PRO");
  });

  it("falls back to the plain local tier line when rank is unknown", () => {
    // Sync off, unpaired, or the board is down — the card must not degrade.
    expect(buildActivity(state({ rank: null }), opts)?.state).toBe("◆ Platinum · PRO");
  });

  it("shows rank while idle too, so the card keeps standing visible", () => {
    const activity = buildActivity(state({ activeToolNames: [], sessionStartMs: null, rank: 3 }), opts);
    expect(activity?.details).toBe("Idle");
    expect(activity?.state).toBe("#3 · ◆ Platinum · PRO");
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
      { label: "⚡ Get grindeasy", url: REPO_URL },
      { label: "☕ Support", url: "https://coffee.example" },
    ]);
  });
});

/** Minimal stand-in for @xhayper/discord-rpc's Client, recording the calls we make. */
class FakeClient {
  user = {
    setActivityCalls: [] as unknown[],
    clearActivityCalls: 0,
    setActivity(activity: unknown) {
      this.setActivityCalls.push(activity);
      return Promise.resolve();
    },
    clearActivity() {
      this.clearActivityCalls += 1;
      return Promise.resolve();
    },
  };
  private handlers: Record<string, () => void> = {};
  on(event: string, cb: () => void): this {
    this.handlers[event] = cb;
    return this;
  }
  login(): Promise<void> {
    return Promise.resolve();
  }
  destroy(): Promise<void> {
    return Promise.resolve();
  }
  emit(event: string): void {
    this.handlers[event]?.();
  }
}

describe("PresenceManager dedupe", () => {
  function connected(): { pm: PresenceManager; fake: FakeClient } {
    const fake = new FakeClient();
    const pm = new PresenceManager(opts, () => fake as unknown as Client);
    pm.start();
    fake.emit("ready");
    return { pm, fake };
  }

  it("pushes once for an unchanged session, so Discord's timer keeps counting", async () => {
    const { pm, fake } = connected();
    const s = state();
    pm.update(s);
    pm.update(s);
    pm.update(s);
    expect(fake.user.setActivityCalls).toHaveLength(1);
    await pm.destroy();
  });

  it("pushes again when the visible card changes", async () => {
    const { pm, fake } = connected();
    pm.update(state({ rank: null }));
    pm.update(state({ rank: 5 }));
    expect(fake.user.setActivityCalls).toHaveLength(2);
    await pm.destroy();
  });

  it("re-pushes after a reconnect even if the state is unchanged", async () => {
    const { pm, fake } = connected();
    const s = state();
    pm.update(s);
    fake.emit("disconnected");
    fake.emit("ready"); // ready re-applies the remembered state
    expect(fake.user.setActivityCalls).toHaveLength(2);
    await pm.destroy();
  });

  it("keys idle (cleared) presence apart from any active payload", () => {
    const active = buildActivity(state(), opts);
    const idle = buildActivity(state({ activeToolNames: [] }), { ...opts, showIdlePresence: false });
    expect(idle).toBeNull();
    expect(presenceKey(idle)).not.toBe(presenceKey(active));
  });
});
