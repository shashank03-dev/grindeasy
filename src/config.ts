import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ToolDef } from "./types.js";

export interface Config {
  /** Discord Application (client) ID from the Developer Portal. Required for the card. */
  discordClientId: string;
  /** How often to poll for activity, in ms. */
  pollIntervalMs: number;
  /** A tool counts as active if its newest file changed within this window, in ms. */
  activeWindowMs: number;
  /** Combo detection window, in ms. */
  comboBucketMs: number;
  /** Port for the local stats web page. */
  statsPort: number;
  /** Where the "support this project" button points. */
  donateUrl: string;
  /** Subscription users declare Pro or Max here (trusted as-is). */
  declaredPlan: "pro" | "max";
  /** Keep the Discord card up (showing tier) even when no tool is active. */
  showIdlePresence: boolean;
  /** Leaderboard server base URL, e.g. https://viberank.example. Empty = sync off. */
  serverUrl: string;
  /** Agent token from your /me page on the leaderboard server. Empty = sync off. */
  accountToken: string;
  /** How often to push totals to the leaderboard server, in ms. */
  syncIntervalMs: number;
  /** Optional overrides for tool detection. Empty = use built-in defaults. */
  tools: ToolDef[];
}

/**
 * viberank's own Discord application. Rich Presence client IDs are public
 * identifiers, not secrets, and shipping ours means a new user gets a working
 * card with zero setup — no Developer Portal, no art assets to upload.
 *
 * UNVERIFIED: Discord's terms have not been confirmed to permit one application
 * serving Rich Presence for every user of a distributed tool. This is the single
 * constant to change if that turns out to be disallowed; setting it back to ""
 * restores the old per-user flow with no other code changes.
 */
export const OFFICIAL_DISCORD_APP_ID = "";

/** The hosted leaderboard. Sync stays off until an account token is paired. */
export const OFFICIAL_SERVER_URL = "https://viberank.dev";

export const DEFAULT_CONFIG: Config = {
  discordClientId: OFFICIAL_DISCORD_APP_ID,
  pollIntervalMs: 5_000,
  activeWindowMs: 60_000,
  comboBucketMs: 5 * 60_000,
  statsPort: 4599,
  donateUrl: "https://www.buymeacoffee.com/",
  declaredPlan: "pro",
  showIdlePresence: true,
  // A default server URL does not make the agent phone home: SyncClient stays
  // disabled until accountToken is set, and that only happens after the user
  // completes `viberank login` in a browser.
  serverUrl: OFFICIAL_SERVER_URL,
  accountToken: "",
  syncIntervalMs: 5 * 60_000,
  tools: [],
};

/** Base directory for all viberank runtime data. */
export function dataDir(home = homedir()): string {
  return join(home, ".viberank");
}

/**
 * Load config from ~/.viberank/config.json, creating a default file on first
 * run. Returns the config plus whether it was just created (so the caller can
 * print setup instructions).
 */
export function loadConfig(home = homedir()): { config: Config; created: boolean } {
  const dir = dataDir(home);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "config.json");
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return { config: { ...DEFAULT_CONFIG, ...parsed }, created: false };
  } catch {
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf8");
    return { config: { ...DEFAULT_CONFIG }, created: true };
  }
}

export function configPath(home = homedir()): string {
  return join(dataDir(home), "config.json");
}

/**
 * Merge changes into the on-disk config, preserving keys the user set by hand
 * and any we don't know about. This is how `viberank login` stores the token it
 * receives from pairing, so nobody ever edits this file themselves.
 */
export function updateConfig(patch: Partial<Config>, home = homedir()): Config {
  const dir = dataDir(home);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "config.json");

  let existing: Partial<Config> = {};
  try {
    existing = JSON.parse(readFileSync(path, "utf8")) as Partial<Config>;
  } catch {
    // No readable config yet; the patch lands on top of the defaults.
  }

  const merged = { ...DEFAULT_CONFIG, ...existing, ...patch };
  writeFileSync(path, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return merged;
}
