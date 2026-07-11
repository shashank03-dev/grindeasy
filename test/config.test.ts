import { existsSync, mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  MIN_SYNC_INTERVAL_MS,
  OFFICIAL_DISCORD_APP_ID,
  OFFICIAL_SERVER_URL,
  configPath,
  loadConfig,
  updateConfig,
} from "../src/config.js";

/** A throwaway $HOME so tests never touch the real ~/.grindboard. */
function fakeHome(config?: Record<string, unknown>): string {
  const home = mkdtempSync(join(tmpdir(), "grindboard-"));
  if (config) {
    mkdirSync(join(home, ".grindboard"), { recursive: true });
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
    // Knowing where the board lives is not consent to send anything to it:
    // sync waits on a token, which only a browser pairing can produce.
    const { config } = loadConfig(fakeHome({ serverUrl: "https://board.example" }));
    expect(config.serverUrl).toBe("https://board.example");
    expect(config.accountToken).toBe("");
    expect(config.askedToJoinBoard).toBe(false);
  });

  it("ships with no board configured, so a fresh install syncs nowhere", () => {
    // OFFICIAL_SERVER_URL is empty until the board has a domain we control.
    const { config } = loadConfig(fakeHome());
    expect(config.serverUrl).toBe(OFFICIAL_SERVER_URL);
    expect(config.accountToken).toBe("");
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

describe("migrateLegacyDir", () => {
  /** A pre-rename install: stats and a paired token sitting in ~/.viberank. */
  function legacyHome(): string {
    const home = mkdtempSync(join(tmpdir(), "grindboard-legacy-"));
    mkdirSync(join(home, ".viberank"), { recursive: true });
    writeFileSync(
      join(home, ".viberank", "config.json"),
      JSON.stringify({ accountToken: "paired-token", declaredPlan: "max" }),
      "utf8",
    );
    writeFileSync(
      join(home, ".viberank", "stats.json"),
      JSON.stringify({ totalCombos: 42 }),
      "utf8",
    );
    return home;
  }

  it("carries a renamed install's hours and token across, so nobody resets to Bronze", () => {
    const home = legacyHome();
    const { config } = loadConfig(home);

    expect(config.accountToken).toBe("paired-token");
    expect(config.declaredPlan).toBe("max");
    // The stats file — the actual tier — comes too.
    const stats = JSON.parse(readFileSync(join(home, ".grindboard", "stats.json"), "utf8"));
    expect(stats.totalCombos).toBe(42);
    expect(existsSync(join(home, ".viberank"))).toBe(false);
  });

  it("never clobbers an existing install with a stale legacy one", () => {
    const home = legacyHome();
    mkdirSync(join(home, ".grindboard"), { recursive: true });
    writeFileSync(configPath(home), JSON.stringify({ accountToken: "current-token" }), "utf8");

    const { config } = loadConfig(home);
    expect(config.accountToken).toBe("current-token");
  });

  it("is a no-op for a fresh install with no legacy directory", () => {
    const home = mkdtempSync(join(tmpdir(), "grindboard-fresh-"));
    const { config, created } = loadConfig(home);
    expect(created).toBe(true);
    expect(config.accountToken).toBe("");
  });
});
