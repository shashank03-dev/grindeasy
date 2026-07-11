import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  MIN_SYNC_INTERVAL_MS,
  OFFICIAL_DISCORD_APP_ID,
  configPath,
  loadConfig,
  updateConfig,
} from "../src/config.js";

/** A throwaway $HOME so tests never touch the real ~/.viberank. */
function fakeHome(config?: Record<string, unknown>): string {
  const home = mkdtempSync(join(tmpdir(), "viberank-"));
  if (config) {
    mkdirSync(join(home, ".viberank"), { recursive: true });
    writeFileSync(configPath(home), JSON.stringify(config), "utf8");
  }
  return home;
}

describe("loadConfig", () => {
  it("ships the official Discord app so a new user needs no setup", () => {
    const { config, created } = loadConfig(fakeHome());
    expect(created).toBe(true);
    expect(config.discordClientId).toBe(OFFICIAL_DISCORD_APP_ID);
  });

  it("lets a user bring their own Discord application", () => {
    const { config } = loadConfig(fakeHome({ discordClientId: "999" }));
    expect(config.discordClientId).toBe("999");
  });

  it("does not enable sync just because a server URL is configured", () => {
    const { config } = loadConfig(fakeHome());
    expect(config.serverUrl).not.toBe("");
    expect(config.accountToken).toBe("");
    expect(config.askedToJoinBoard).toBe(false);
  });

  it("clamps hand-edited sync intervals to what the server accepts", () => {
    // 1s would earn nothing but 429s from the server's per-minute gap.
    const { config } = loadConfig(fakeHome({ activeSyncIntervalMs: 1_000, syncIntervalMs: 5_000 }));
    expect(config.activeSyncIntervalMs).toBe(MIN_SYNC_INTERVAL_MS);
    expect(config.syncIntervalMs).toBe(MIN_SYNC_INTERVAL_MS);
  });

  it("syncs faster while active than while idle by default", () => {
    expect(DEFAULT_CONFIG.activeSyncIntervalMs).toBeLessThan(DEFAULT_CONFIG.syncIntervalMs);
    expect(DEFAULT_CONFIG.activeSyncIntervalMs).toBe(MIN_SYNC_INTERVAL_MS);
  });
});

describe("updateConfig", () => {
  it("stores the paired token without disturbing hand-set keys", () => {
    const home = fakeHome({ declaredPlan: "max", statsPort: 1234 });
    const merged = updateConfig({ accountToken: "tok", askedToJoinBoard: true }, home);

    expect(merged).toMatchObject({
      accountToken: "tok",
      askedToJoinBoard: true,
      declaredPlan: "max",
      statsPort: 1234,
    });
    expect(JSON.parse(readFileSync(configPath(home), "utf8"))).toMatchObject({
      accountToken: "tok",
      declaredPlan: "max",
    });
  });
});
